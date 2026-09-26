import test from 'node:test';
import assert from 'node:assert/strict';
import { reconcile, toCsv, stateOptions } from '../shared/workflow.js';
import { createApi } from '../frontend/src/api/client.js';
import { listQuery } from '../backend/src/repositories/repository.js';
import { createCatalog } from '../backend/src/config/catalog.js';
import { guardMutation } from '../backend/src/services/workflow.js';
const catalog = createCatalog();
test('reconciliation preserves decimal precision, rejects unknown concept types and empty details', () => {
  const details = [
    {
      NOD_ID: '1',
      NOD_INGRESOS: '9999999999999999.99',
      NOD_DEDUCCIONES: '0.01',
      NOD_LIQUIDO: '9999999999999999.98',
    },
  ];
  const concepts = [
    { NOD_ID: '1', NCO_TIPO: 'INGRESO', NDC_MONTO: '9999999999999999.99' },
    { NOD_ID: '1', NCO_TIPO: 'DEDUCCION', NDC_MONTO: '0.01' },
  ];
  assert.equal(reconcile(details, concepts)[0].balanced, true);
  assert.equal(reconcile(details, concepts)[0].calculatedNet, '9999999999999999.98');
  assert.equal(reconcile(details, [])[0].balanced, false);
  assert.equal(
    reconcile(details, [...concepts, { NOD_ID: '1', NCO_TIPO: 'OTRO', NDC_MONTO: '1' }])[0]
      .balanced,
    false,
  );
});
test('exports neutralize spreadsheet formulas and escape commas, quotes and newlines', () => {
  const csv = toCsv(
    ['Nombre', 'Valor'],
    [
      [' =HYPERLINK("x")', 'a,b\n"c"'],
      ['@cmd', '-1'],
    ],
  );
  assert.ok(csv.startsWith('\uFEFF'));
  assert.ok(csv.includes('"\' =HYPERLINK'));
  assert.ok(csv.includes('"a,b\n""c"""'));
  assert.ok(csv.includes('"\'@cmd"'));
});
test('empty or non-JSON responses produce recovery instructions; abort stays abort', async () => {
  const api = createApi('/api', async () => ({
    status: 502,
    json: async () => {
      throw new SyntaxError('Unexpected end of JSON input');
    },
  }));
  await assert.rejects(api('/empleado'), /servicio de Nómina no está disponible/);
  await assert.rejects(
    api('/empleado', { method: 'POST', body: '{}' }),
    /Revisa el listado antes de repetir/,
  );
  const aborted = createApi('/api', async () => {
    const e = new Error();
    e.name = 'AbortError';
    throw e;
  });
  await assert.rejects(aborted('/empleado'), { name: 'AbortError' });
});
test('combined filters, company, and date range are validated and bound without SQL interpolation', () => {
  const t = catalog.get('NOM_TRANSFERENCIA_PAGO');
  const q = listQuery(t, catalog, {
    company: '1',
    filter_TRP_ESTADO: 'CONFIRMADA',
    dateField: 'TRP_FECHA',
    from: '2026-09-01',
    to: '2026-09-30',
  });
  assert.equal(q.binds.company, '1');
  assert.equal(q.binds.filter_TRP_ESTADO, 'CONFIRMADA');
  assert.equal(q.binds.range_from, '2026-09-01');
  assert.ok(q.sql.includes('NOM_NOMINA_DETALLE'));
  assert.ok(!q.sql.includes('CONFIRMADA'));
  assert.throws(() => listQuery(t, catalog, { filter_UNKNOWN: 'x' }), /Filtro no válido/);
  assert.throws(
    () => listQuery(t, catalog, { dateField: 'TRP_FECHA', from: '2026-10-01', to: '2026-09-01' }),
    /fecha final/,
  );
});
test('critical initial and terminal states cannot bypass workflow through generic CRUD', async () => {
  const c = { execute: async () => ({ rows: [] }) };
  for (const [name, data, previous] of [
    ['NOM_NOMINA', { NOM_ESTADO: 'PAGADA' }, null],
    ['NOM_VACACION', { VAC_ESTADO: 'APROBADA' }, null],
    ['NOM_RELACION_LABORAL', { RLA_ESTADO: 'FINALIZADA' }, null],
    ['NOM_NOMINA', { NOM_ESTADO: 'BORRADOR' }, { NOM_ESTADO: 'PAGADA' }],
  ])
    await assert.rejects(
      guardMutation(c, catalog, catalog.get(name), data, previous),
      (e) => e.status === 422,
    );
  assert.deepEqual(stateOptions({ name: 'TRP_ESTADO' }), [
    'PENDIENTE',
    'CONFIRMADA',
    'RECHAZADA',
    'ANULADA',
  ]);
});
