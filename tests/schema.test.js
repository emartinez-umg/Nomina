import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import schema from '../shared/schema.json' with { type: 'json' };
import { groups } from '../shared/catalog.js';
import { validatePayload, validDate } from '../shared/validation.js';
import { parseCheck, evaluateCheck } from '../shared/checks.js';
import { createCatalog } from '../backend/src/config/catalog.js';
import { listQuery } from '../backend/src/repositories/repository.js';
const table = (name) => schema.tables.find((t) => t.name === 'NOM_' + name);
test('every DDL table, CHECK and foreign key is covered in the nine groups', () => {
  const model = JSON.parse(readFileSync(new URL('../db/schema-erp.json', import.meta.url)));
  const nom = model.filter((t) => t.name.startsWith('NOM_'));
  assert.deepEqual(schema.tables.map((t) => t.name).sort(), nom.map((t) => t.name).sort());
  assert.equal(schema.tables.length, 35);
  assert.equal(groups.length, 9);
  assert.equal(
    schema.tables.reduce((n, t) => n + t.checks.length, 0),
    nom.reduce((n, t) => n + t.constraints.filter((c) => c.type === 'C').length, 0),
  );
  const catalog = createCatalog();
  for (const t of schema.tables) {
    assert.ok(t.group);
    for (const f of t.fields.filter((f) => f.ref))
      assert.ok(catalog.get(f.ref.table)?.fields.some((c) => c.name === f.ref.pk));
  }
});
test('precise amounts are preserved without floating point rounding', () => {
  const t = table('NOMINA_CONCEPTO');
  let r = validatePayload(
    t,
    { NOD_ID: '1', NCO_ID: '1', NDC_MONTO: '9999999999999999.99' },
    { create: true },
  );
  assert.deepEqual(r.errors, {});
  assert.equal(r.data.NDC_MONTO, '9999999999999999.99');
  assert.ok(
    validatePayload(
      t,
      { NOD_ID: '1', NCO_ID: '1', NDC_MONTO: '10000000000000000.00' },
      { create: true },
    ).errors.NDC_MONTO,
  );
  assert.ok(
    validatePayload(t, { NOD_ID: '1', NCO_ID: '1', NDC_MONTO: '12.345' }, { create: true }).errors
      .NDC_MONTO,
  );
});
test('SQL three-valued CHECK logic and date ordering', () => {
  assert.equal(evaluateCheck(parseCheck('A >= 0 AND B >= 0'), { A: null, B: '2' }), null);
  assert.equal(evaluateCheck(parseCheck('A >= 0 AND B >= 0'), { A: null, B: '-1' }), false);
  assert.equal(evaluateCheck(parseCheck('A IS NULL OR A >= B'), { A: null, B: '1' }), true);
  assert.equal(evaluateCheck(parseCheck('A >= B'), { A: '2026-05-01', B: '2026-06-01' }), false);
});
test('transfers now require a payroll detail and have no liquidation origin', () => {
  const base = { CBE_ID: '1', TRP_FECHA: '2026-09-11', TRP_MONTO: '1.01', TRP_ESTADO: 'PENDIENTE' };
  assert.ok(validatePayload(table('TRANSFERENCIA_PAGO'), base, { create: true }).errors.NOD_ID);
  assert.deepEqual(
    validatePayload(table('TRANSFERENCIA_PAGO'), { ...base, NOD_ID: '1' }, { create: true }).errors,
    {},
  );
  assert.ok(
    validatePayload(
      table('TRANSFERENCIA_PAGO'),
      { ...base, NOD_ID: '1', LIL_ID: '1' },
      { create: true },
    ).errors.LIL_ID,
  );
});
test('cross-column and nonnegative constraints reject invalid rows', () => {
  assert.ok(
    validatePayload(
      table('JEFATURA_LABORAL'),
      {
        RLA_ID_SUBORDINADO: '1',
        RLA_ID_JEFE: '1',
        JRL_FECHA_DESDE: '2026-09-07',
        JRL_FECHA_HASTA: '2026-09-01',
      },
      { create: true },
    ).errors.RLA_ID_JEFE,
  );
  assert.ok(
    validatePayload(
      table('NOMINA_DETALLE'),
      { NOM_ID: '1', RLA_ID: '1', NOD_LIQUIDO: '0', NOD_HORAS_EXTRA: '-0.01' },
      { create: true },
    ).errors.NOD_HORAS_EXTRA,
  );
});
test('calendar validation, times, nullable defaults and text byte lengths', () => {
  assert.equal(validDate('2026-02-29'), false);
  assert.equal(validDate('2024-02-29'), true);
  assert.equal(validDate('2026-01-01T24:00', true), false);
  assert.equal(validDate('2026-01-01T23:59:59.123456', true), true);
  assert.ok(
    validatePayload(table('PUESTO'), { PUE_NOMBRE: 'é'.repeat(51) }, { create: true }).errors
      .PUE_NOMBRE,
  );
  assert.equal(
    validatePayload(table('TIPO_CONTRATO'), { TCT_NOMBRE: 'Temporal' }, { create: true }).data
      .TCT_ACTIVO,
    '1',
  );
  assert.ok(
    validatePayload(
      table('TIPO_CONTRATO'),
      { TCT_NOMBRE: 'Temporal', TCT_ACTIVO: null },
      { create: true },
    ).errors.TCT_ACTIVO,
  );
});
test('deletion uses only existing active flags or cancellation states', () => {
  const ddlNames = new Set(schema.tables.flatMap((t) => t.fields.map((f) => f.name)));
  assert.ok(!ddlNames.has('NPE_ACTIVO'));
  for (const t of schema.tables) {
    const p = t.lifecycle;
    if (p.mode === 'cancel')
      assert.ok(t.fields.find((f) => f.name === p.field).options.includes(p.value));
    if (p.mode === 'inactive') assert.match(p.field, /_ACTIV[OA]$/);
  }
  assert.equal(table('PERIODO').lifecycle.mode, 'state');
  assert.equal(table('RELACION_LABORAL').lifecycle.mode, 'state');
  assert.equal(table('AUSENCIA').lifecycle.mode, 'state');
  assert.equal(table('JEFATURA_LABORAL').lifecycle.mode, 'inactive');
});
test('sort identifiers cannot inject SQL and search remains a bind', () => {
  const t = table('EMPLEADO'),
    catalog = createCatalog();
  assert.throws(() => listQuery(t, catalog, { sort: 'EML_ID; DELETE FROM NOM_EMPLEADO' }));
  assert.throws(() => listQuery(t, catalog, { direction: 'DESC;--' }));
  assert.throws(() => listQuery(t, catalog, { pageSize: 999 }));
  const q = "x' OR 1=1 --%_";
  const r = listQuery(t, catalog, { q });
  assert.ok(!r.sql.includes(q));
  assert.match(r.sql, /:search/);
  assert.match(r.binds.search, /\\%\\_/);
  assert.match(r.sql, /ERP_PERSONA/);
});
test('timestamps with omitted seconds compare as the same local instant', () => {
  const r = validatePayload(
    table('MARCAJE'),
    {
      RLA_ID: '1',
      TDI_ID: '1',
      MRC_FECHA: '2026-09-07',
      MRC_ENTRADA: '2026-09-07T08:00:00.000000',
      MRC_SALIDA: '2026-09-07T08:00',
    },
    { create: true },
  );
  assert.deepEqual(r.errors, {});
  assert.equal(r.data.MRC_SALIDA, '2026-09-07T08:00:00.000000');
});

test('shared periods require year and month and exclude the former company/dates', () => {
  const base = { NPE_ANIO: '2026', NPE_MES: '9', NPE_TIPO: 'MENSUAL', NPE_ESTADO: 'ABIERTO' };
  assert.deepEqual(validatePayload(table('PERIODO'), base, { create: true }).errors, {});
  assert.ok(
    validatePayload(table('PERIODO'), { ...base, NPE_MES: '13' }, { create: true }).errors.NPE_MES,
  );
  assert.ok(
    validatePayload(table('PERIODO'), { ...base, EMP_ID: '1' }, { create: true }).errors.EMP_ID,
  );
  assert.ok(table('NOMINA').fields.find((f) => f.name === 'EMP_ID').required);
});
test('employee salary is separated and contractual data lives in the relationship', () => {
  const base = {
    PER_ID: '1',
    EMP_ID: '1',
    EML_CODIGO: 'TEST',
    EML_SALARIO_ORDINARIO_MENSUAL: '5500',
    EML_SALARIO_BONIFICACION_DECRETO: '0',
  };
  assert.deepEqual(validatePayload(table('EMPLEADO'), base, { create: true }).errors, {});
  assert.ok(
    validatePayload(
      table('EMPLEADO'),
      { ...base, EML_SALARIO_BONIFICACION_DECRETO: '-1' },
      { create: true },
    ).errors.EML_SALARIO_BONIFICACION_DECRETO,
  );
  assert.ok(!table('EMPLEADO').fields.some((f) => f.name === 'PUE_ID'));
  assert.ok(!table('RELACION_LABORAL').fields.some((f) => f.name === 'RLA_SALARIO'));
  assert.ok(table('CUENTA_BANCARIA_EMPLEADO').fields.find((f) => f.name === 'BAN_ID').required);
});
test('new discounts and variable income follow the supplied constraints', () => {
  assert.ok(
    validatePayload(
      table('DESCUENTO_APLICADO'),
      { EML_ID: '1', TDE_ID: '1', NPE_ID: '1', DAP_MONTO: '0' },
      { create: true },
    ).errors.DAP_MONTO,
  );
  assert.deepEqual(
    validatePayload(
      table('INGRESO_VARIABLE'),
      {
        RLA_ID: '1',
        NPE_ID: '1',
        TIN_ID: '1',
        INV_FECHA: '2026-09-11',
        INV_MONTO: '500',
        INV_ESTADO: 'PENDIENTE',
        INV_BASE: null,
        INV_PORCENTAJE: null,
      },
      { create: true },
    ).errors,
    {},
  );
  assert.ok(
    !table('MOVIMIENTO')
      .fields.find((f) => f.name === 'NMO_TIPO')
      .options.includes('ANTICIPO'),
  );
  assert.ok(
    table('PRESTAMO')
      .fields.find((f) => f.name === 'NPR_TIPO')
      .options.includes('ANTICIPO'),
  );
});

test('Oracle rewrites renamed IN constraints without losing selects and switches', () => {
  assert.deepEqual(table('INGRESO_VARIABLE').fields.find((f) => f.name === 'INV_ESTADO').options, [
    'PENDIENTE',
    'APROBADA',
    'PAGADA',
    'ANULADA',
  ]);
  assert.equal(table('INGRESO_VARIABLE').lifecycle.mode, 'cancel');
  assert.equal(table('TIPO_INGRESO').fields.find((f) => f.name === 'TIN_ACTIVO').boolean, true);
});
