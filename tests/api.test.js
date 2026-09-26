import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../backend/src/app.js';
import schema from '../shared/schema.json' with { type: 'json' };
function harness(handler = async () => ({ rows: [] })) {
  const calls = [],
    state = { commits: 0, rollbacks: 0, closed: 0 };
  const pool = {
    getConnection: async () => ({
      execute: async (sql, binds) => {
        calls.push({ sql, binds });
        return handler(sql, binds);
      },
      commit: async () => state.commits++,
      rollback: async () => state.rollbacks++,
      close: async () => state.closed++,
    }),
  };
  return { app: createApp({ pool }), calls, state };
}
test('metadata includes payroll and HR masters; lookup endpoints are read only', async () => {
  const { app } = harness();
  const r = await request(app).get('/api/nomina/metadata');
  assert.equal(r.status, 200);
  assert.equal(r.body.tables.length, 51);
  assert.equal(
    (await request(app).post('/api/nomina/lookups/ERP_PERSONA').send({ NOMBRE: 'X' })).status,
    404,
  );
});
test('all 35 routes are registered; invalid payloads never reach Oracle', async () => {
  const { app, calls } = harness();
  for (const t of schema.tables) {
    const r = await request(app)
      .post('/api/nomina/' + t.slug)
      .send({ UNKNOWN: 'x' });
    assert.equal(r.status, 422, t.name);
  }
  assert.equal(calls.length, 0);
});
test('create commits, duplicate rolls back and exposes unique field', async () => {
  const h = harness(async (sql) =>
    sql.startsWith('INSERT')
      ? { outBinds: { id: ['1'] } }
      : { rows: [{ PUE_ID: '1', PUE_NOMBRE: 'Docente', PUE_ES_VENDEDOR: '0' }] },
  );
  const r = await request(h.app).post('/api/nomina/puesto').send({ PUE_NOMBRE: 'Docente' });
  assert.equal(r.status, 201);
  assert.equal(h.state.commits, 1);
  assert.equal(h.state.closed, 1);
  const failing = harness(async () => {
    throw { errorNum: 1, message: 'ORA-00001: unique constraint (NOMINA.UQ_NOM_PUESTO) violated' };
  });
  const d = await request(failing.app).post('/api/nomina/puesto').send({ PUE_NOMBRE: 'Docente' });
  assert.equal(d.status, 409);
  assert.ok(d.body.fields.PUE_NOMBRE);
  assert.equal(failing.state.rollbacks, 1);
  assert.equal(failing.state.closed, 1);
});
test('partial edit validates against the locked current row', async () => {
  const h = harness(async (sql) =>
    sql.startsWith('SELECT')
      ? {
          rows: [
            {
              VAC_ID: '1',
              EML_ID: '1',
              VAC_FECHA_INICIO: '2026-09-10',
              VAC_FECHA_FIN: '2026-09-20',
              VAC_ESTADO: 'SOLICITADA',
            },
          ],
        }
      : {},
  );
  const r = await request(h.app)
    .put('/api/nomina/vacacion/1')
    .send({ VAC_FECHA_FIN: '2026-09-01' });
  assert.equal(r.status, 422);
  assert.ok(h.calls[0].sql.endsWith('FOR UPDATE'));
  assert.equal(h.state.rollbacks, 1);
  assert.ok(!h.calls.some((c) => c.sql.startsWith('UPDATE')));
});
test('state-only tables block delete and inactive tables update instead of delete', async () => {
  const h = harness(async () => ({
    rows: [{ TCT_ID: '1', TCT_NOMBRE: 'Temporal', TCT_ACTIVO: '1' }],
  }));
  assert.equal((await request(h.app).delete('/api/nomina/periodo/1')).status, 409);
  assert.equal((await request(h.app).delete('/api/nomina/tipo-contrato/1')).status, 204);
  assert.ok(h.calls.some((c) => c.sql.startsWith('UPDATE NOM_TIPO_CONTRATO')));
  assert.ok(!h.calls.some((c) => c.sql.startsWith('DELETE')));
});
test('health reports actual database failures', async () => {
  const h = harness(async () => {
    throw Error('not connected');
  });
  assert.equal((await request(h.app).get('/api/nomina/health')).status, 503);
});
test('all 16 HR masters reject invalid input without exposing ERP credentials', async () => {
  const h = harness();
  for (const t of schema.masters) {
    assert.ok(!t.fields.some((f) => /PASSWORD|HASH/.test(f.name)));
    const r = await request(h.app)
      .post('/api/nomina/' + t.slug)
      .send({ UNKNOWN: 'x' });
    assert.equal(r.status, 422, t.name);
  }
  assert.equal(h.calls.length, 0);
  assert.equal((await request(h.app).post('/api/nomina/erp-usuario').send({})).status, 404);
});
test('person and email validation presents field errors in HR forms', async () => {
  const h = harness();
  const p = await request(h.app).post('/api/nomina/erp-persona').send({ PER_TIPO: 'F' });
  assert.equal(p.status, 422);
  assert.ok(p.body.fields.PER_NOMBRES);
  const mail = await request(h.app)
    .post('/api/nomina/erp-persona-correo')
    .send({ PER_ID: '1', PCO_CORREO: 'bad address' });
  assert.equal(mail.status, 422);
  assert.ok(mail.body.fields.PCO_CORREO);
  assert.equal(h.calls.length, 0);
});
test('both phone APIs reject letters and short phones before writing', async () => {
  const h = harness();
  for (const [route, body, field] of [
    ['erp-persona-telefono', { PER_ID: '1', PTE_TIPO: 'PERSONAL' }, 'PTE_NUMERO'],
    ['contacto-emergencia', { EML_ID: '1', NCE_NOMBRE: 'Contacto de prueba' }, 'NCE_TELEFONO'],
  ])
    for (const number of ['abcdef12', '1234567', '123456789', '+50212345678']) {
      const r = await request(h.app)
        .post('/api/nomina/' + route)
        .send({ ...body, [field]: number });
      assert.equal(r.status, 422);
      assert.ok(r.body.fields[field]);
    }
  assert.equal(h.calls.length, 0);
});
