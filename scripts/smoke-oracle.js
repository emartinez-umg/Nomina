// Creates a disposable schema. Never modifies the user's NOMINA data.
import { installWorkflow } from '../backend/src/services/workflow-schema.js';
import oracledb from 'oracledb';
import { loadEnvFile } from 'node:process';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import request from 'supertest';
import schema from '../shared/schema.json' with { type: 'json' };
import { parseScript } from './lib/sql-script.js';
import { demoData } from './lib/demo-data.js';
import { insertRows, seedCatalogs, validateInstalled } from './lib/migration-data.js';
import { createPool } from '../backend/src/config/pool.js';
import { createApp } from '../backend/src/app.js';
import { verifyHr } from './lib/verify-hr.js';
try {
  loadEnvFile('.env');
} catch {}
const tempUser = 'NOM_TEST_' + Date.now(),
  password = 'Test' + Date.now() + 'Safe',
  ids = {},
  catalog = new Map(
    [...schema.tables, ...schema.masters, ...schema.externals].map((t) => [t.name, t]),
  );
const admin = await oracledb.getConnection({
  user: 'SYSTEM',
  password: process.env.ORACLE_PWD,
  connectString: process.env.NOM_DB_CONNECT_STRING,
});
let pool,
  testConnection,
  created = false;
function statements(file) {
  return readFileSync(new URL('../db/' + file, import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/--[^\n]*/g, '')
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean);
}
function fixture(t, index = 1) {
  const row = {};
  for (const f of t.fields) {
    if (f.identity || f.default !== undefined) continue;
    if (f.ref) {
      row[f.name] = ids[f.ref.table][0];
      continue;
    }
    if (!f.required) continue;
    if (f.input === 'tel') {
      row[f.name] = '12345678';
      continue;
    }
    if (f.options) row[f.name] = f.options[0];
    else if (f.type === 'DATE') row[f.name] = '2026-09-07';
    else if (f.type === 'TIMESTAMP') row[f.name] = '2026-09-07T08:00:00';
    else if (f.type === 'NUMBER') row[f.name] = '1';
    else row[f.name] = f.input === 'time' ? '08:00' : f.maxLength < 10 ? 'X' : `Prueba ${index}`;
  }
  if (t.name === 'ERP_EMPRESA') row.EMP_NIT = '7654321-8';
  if (t.name === 'ERP_PERSONA')
    Object.assign(row, { PER_TIPO: 'F', PER_NOMBRES: 'Prueba', PER_APELLIDOS: 'RRHH' });
  if (t.name === 'ERP_PERSONA_CORREO') row.PCO_CORREO = 'prueba@example.invalid';
  if (t.name === 'NOM_CONCEPTO') row.NCO_TIPO = 'INGRESO';
  if (t.name === 'NOM_RELACION_LABORAL') delete row.MBA_ID;
  if (t.name === 'NOM_NOMINA_DETALLE') row.NOD_LIQUIDO = '0';
  if (t.name === 'NOM_TRANSFERENCIA_PAGO') row.TRP_ESTADO = 'PENDIENTE';
  if (t.name === 'NOM_VACACION') {
    row.VAC_FECHA_INICIO = '2026-10-01';
    row.VAC_FECHA_FIN = '2026-10-05';
  }
  if (t.name === 'NOM_LIQUIDACION_LABORAL') row.RLA_ID = ids.NOM_RELACION_LABORAL[1];
  if (t.name === 'NOM_JEFATURA_LABORAL') row.RLA_ID_JEFE = ids.NOM_RELACION_LABORAL[1];

  return row;
}
try {
  await admin.execute(
    `CREATE USER ${tempUser} IDENTIFIED BY "${password}" DEFAULT TABLESPACE USERS QUOTA UNLIMITED ON USERS`,
  );
  created = true;
  await admin.execute(`GRANT CREATE SESSION, CREATE TABLE, CREATE SEQUENCE TO ${tempUser}`);
  testConnection = await oracledb.getConnection({
    user: tempUser,
    password,
    connectString: process.env.NOM_DB_CONNECT_STRING,
  });
  for (const { sql } of parseScript(readFileSync('db/ERP_ESQUEMA_FINAL.sql', 'utf8')))
    await testConnection.execute(sql);
  await insertRows(testConnection, demoData({ nomina: false }));
  await seedCatalogs(testConnection);
  await installWorkflow(testConnection);
  await validateInstalled(testConnection);
  for (const t of [...schema.masters, ...schema.externals])
    ids[t.name] = (
      await testConnection.execute(
        `SELECT ${t.pk} FROM ${t.name} ORDER BY ${t.pk}`,
        {},
        {
          fetchTypeHandler: (m) =>
            m.dbType === oracledb.DB_TYPE_NUMBER ? { type: oracledb.STRING } : undefined,
        },
      )
    ).rows.flat();
  pool = await createPool({ ...process.env, NOM_DB_USER: tempUser, NOM_DB_PASSWORD: password });
  const app = createApp({ pool, authentication: false });
  const pending = [...schema.masters, ...schema.tables],
    createdTables = [];
  while (pending.length) {
    let progressed = false;
    for (const t of [...pending]) {
      if (t.fields.some((f) => f.ref && !ids[f.ref.table]?.length)) continue;
      if (t.name === 'NOM_TRANSFERENCIA_PAGO') {
        if (!ids.NOM_NOMINA_CONCEPTO?.length) continue;
        // Fixture state: individual CRUD is tested here; transition checks live in test:workflow.
        await testConnection.execute(
          "UPDATE NOM_NOMINA SET NOM_ESTADO='CALCULADA' WHERE NOM_ID=:id",
          { id: ids.NOM_NOMINA[0] },
        );
        await testConnection.commit();
      }
      if (t.name === 'NOM_LIQUIDACION_LABORAL') {
        await testConnection.execute(
          "UPDATE NOM_RELACION_LABORAL SET RLA_ESTADO='FINALIZADA',RLA_FECHA_BAJA=DATE '2026-09-07',RLA_MOTIVO_BAJA='Cierre de fixture' WHERE RLA_ID=:id",
          { id: ids.NOM_RELACION_LABORAL[1] },
        );
        await testConnection.commit();
      }
      const create = await request(app)
        .post('/api/nomina/' + t.slug)
        .send(fixture(t));
      assert.equal(create.status, 201, `${t.name} POST: ${JSON.stringify(create.body)}`);
      ids[t.name] = [create.body[t.pk]];
      createdTables.push(t);
      if (t.name === 'NOM_RELACION_LABORAL') {
        const second = await request(app)
          .post('/api/nomina/' + t.slug)
          .send(fixture(t, 2));
        assert.equal(second.status, 201);
        ids[t.name].push(second.body[t.pk]);
      }
      const read = await request(app).get(`/api/nomina/${t.slug}/${ids[t.name][0]}`);
      assert.equal(read.status, 200, `${t.name} GET`);
      const update = await request(app).put(`/api/nomina/${t.slug}/${ids[t.name][0]}`).send({});
      assert.equal(update.status, 200, `${t.name} PUT ${JSON.stringify(update.body)}`);
      for (const options of [
        '',
        '?q=Prueba',
        '?page=1&pageSize=10&sort=' + t.pk + '&direction=desc',
      ]) {
        const list = await request(app).get('/api/nomina/' + t.slug + options);
        assert.equal(list.status, 200, `${t.name} LIST ${JSON.stringify(list.body)}`);
      }
      if (t.name === 'NOM_TRANSFERENCIA_PAGO') {
        await testConnection.execute(
          "UPDATE NOM_NOMINA SET NOM_ESTADO='BORRADOR' WHERE NOM_ID=:id",
          { id: ids.NOM_NOMINA[0] },
        );
        await testConnection.commit();
      }
      console.log('CRUD lectura/escritura:', t.name);
      pending.splice(pending.indexOf(t), 1);
      progressed = true;
    }
    if (!progressed) throw Error('Unresolved dependencies');
  }
  for (const t of catalog.values()) {
    const result = await request(app).get('/api/nomina/lookups/' + t.name);
    assert.equal(result.status, 200, `${t.name} LOOKUP ${JSON.stringify(result.body)}`);
    if (schema.tables.includes(t)) assert.ok(result.body.options.length);
  }
  const badForeign = await request(app)
    .post('/api/nomina/contacto-emergencia')
    .send({ EML_ID: '999999', NCE_NOMBRE: 'No existe', NCE_TELEFONO: '12345678' });
  assert.equal(badForeign.status, 409);
  assert.ok(badForeign.body.fields.EML_ID);
  const duplicate = await request(app).post('/api/nomina/puesto').send({ PUE_NOMBRE: 'Prueba 1' });
  assert.equal(duplicate.status, 409);
  assert.ok(duplicate.body.fields.PUE_NOMBRE);
  const precise = await request(app)
    .put(`/api/nomina/nomina-concepto/${ids.NOM_NOMINA_CONCEPTO[0]}`)
    .send({ NDC_MONTO: '9999999999999999.99' });
  assert.equal(precise.status, 200);
  assert.equal(precise.body.NDC_MONTO, '9999999999999999.99');
  const badDate = await request(app)
    .put(`/api/nomina/vacacion/${ids.NOM_VACACION[0]}`)
    .send({ VAC_FECHA_FIN: '2026-09-06' });
  assert.equal(badDate.status, 422);
  const wrongOrigin = await request(app)
    .put(`/api/nomina/transferencia-pago/${ids.NOM_TRANSFERENCIA_PAGO[0]}`)
    .send({ LIL_ID: ids.NOM_LIQUIDACION_LABORAL[0] });
  assert.equal(wrongOrigin.status, 422);
  const parentDelete = await request(app).delete(`/api/nomina/puesto/${ids.NOM_PUESTO[0]}`);
  assert.equal(parentDelete.status, 409);
  const currentPeriod = await request(app).get(`/api/nomina/periodo/${ids.NOM_PERIODO[0]}`);
  const duplicateOpen = {
    ...currentPeriod.body,
    NPE_ANIO: '2027',
  };
  delete duplicateOpen.NPE_ID;
  delete duplicateOpen.__version;
  const openResult = await request(app).post('/api/nomina/periodo').send(duplicateOpen);
  assert.equal(openResult.status, 409);
  assert.ok(openResult.body.fields.NPE_ESTADO);
  await verifyHr(app, testConnection, ids);
  for (const t of [...createdTables].filter((t) => t.name.startsWith('NOM_')).reverse())
    for (const id of [...ids[t.name]].reverse()) {
      const before =
        t.name === 'NOM_PERIODO'
          ? (await request(app).get(`/api/nomina/${t.slug}/${id}`)).body
          : null;
      const r = await request(app).delete(`/api/nomina/${t.slug}/${id}`);
      assert.equal(
        r.status,
        t.lifecycle.mode === 'state'
          ? 409
          : ['NOM_NOMINA', 'NOM_VACACION'].includes(t.name)
            ? 422
            : 204,
        `${t.name} DELETE ${JSON.stringify(r.body)}`,
      );
      if (t.name === 'NOM_PERIODO' && before.NPE_ESTADO === 'ABIERTO') {
        assert.equal((await request(app).get(`/api/nomina/${t.slug}/${id}`)).status, 404);
      } else if (t.lifecycle.mode !== 'delete') {
        const read = await request(app).get(`/api/nomina/${t.slug}/${id}`);
        assert.equal(read.status, 200);
        if (r.status === 204 && t.lifecycle.field && t.lifecycle.value)
          assert.equal(read.body[t.lifecycle.field], t.lifecycle.value);
        await testConnection.execute(`DELETE FROM ${t.name} WHERE ${t.pk}=:id`, { id });
        await testConnection.commit();
      }
    }
  console.log(
    'OK: 51 formularios, 53 catálogos, precisión decimal, restricciones, conflictos y políticas de eliminación en Oracle 21c.',
  );
} finally {
  if (pool) await pool.close(0);
  if (testConnection) await testConnection.close();
  if (created) await admin.execute(`DROP USER ${tempUser} CASCADE`);
  await admin.close();
}
