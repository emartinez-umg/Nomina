import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseScript } from '../scripts/lib/sql-script.js';
import { demoData } from '../scripts/lib/demo-data.js';
const model = JSON.parse(readFileSync(new URL('../db/schema-erp.json', import.meta.url)));
test('the full ERP includes 194 tables and final accounting definitions', () => {
  assert.equal(model.length, 194);
  const fields = (name) => model.find((t) => t.name === name).columns;
  assert.ok(fields('CON_CUENTA_CONTABLE').some((f) => f.name === 'CCO_ID_PADRE'));
  assert.ok(fields('CON_PARTIDA').some((f) => f.name === 'PAR_NUMERO' && f.type === 'VARCHAR2'));
  assert.ok(fields('CON_ASIENTO').some((f) => f.name === 'ASI_LINEA'));
  assert.ok(fields('CON_INTEGRACION_DETALLE').some((f) => f.name === 'IDE_ID'));
  const nature = model
    .find((t) => t.name === 'CON_CUENTA_CONTABLE')
    .constraints.filter((c) => c.type === 'C' && c.sql.includes('CCO_NATURALEZA'));
  assert.equal(nature.length, 1);
  assert.match(nature[0].sql, /'D','H'/);
});
test('Oracle script splitting keeps PL/SQL and quoted semicolons intact', () => {
  const parts = parseScript(
    "SET DEFINE OFF;\nINSERT INTO T VALUES ('a;b');\nBEGIN\n NULL;\nEND;\n/\nSELECT 1 FROM DUAL;\n",
  );
  assert.equal(parts.length, 3);
  assert.ok(parts[1].sql.endsWith('END;'));
  assert.ok(parts[0].sql.includes('a;b'));
});
test('demo transformation preserves salary and contractual data', () => {
  const data = demoData(),
    e = data.NOM_EMPLEADO[0],
    r = data.NOM_RELACION_LABORAL[0];
  assert.equal(e.EML_SALARIO_ORDINARIO_MENSUAL, '5500');
  assert.equal(e.EML_SALARIO_BONIFICACION_DECRETO, '0');
  assert.equal(r.PUE_ID, '1');
  assert.equal(r.RLA_FECHA_INGRESO, '2026-01-05');
  assert.ok(!('EML_SALARIO' in e));
  assert.ok(data.ERP_USUARIO[0].USU_PASSWORD_HASH.startsWith('!'));
});
