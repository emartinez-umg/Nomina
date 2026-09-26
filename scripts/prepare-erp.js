import { readFileSync, writeFileSync } from 'node:fs';
import { parseScript } from './lib/sql-script.js';
const source = readFileSync(
  new URL('../db/source/ERP_MAS_NOMINA_COMPLETO.sql', import.meta.url),
  'utf8',
);
const original = parseScript(source),
  lastCreate = new Map();
for (const s of original) {
  const m = s.sql.match(
    /^CREATE TABLE (CON_INTEGRACION_MODULO|CON_INTEGRACION_DETALLE|CON_PRESUPUESTO)\b/,
  );
  if (m) lastCreate.set(m[1], s.sql);
}
const seen = new Set(),
  changes = [],
  output = [];
for (const entry of original) {
  let sql = entry.sql,
    reason = '';
  const compact = sql.replace(/\s+/g, ' ');
  const create = sql.match(
    /^CREATE TABLE (CON_INTEGRACION_MODULO|CON_INTEGRACION_DETALLE|CON_PRESUPUESTO)\b/,
  );
  if (create) {
    if (seen.has(create[1])) {
      sql = '';
      reason = 'Eliminar CREATE duplicado; se consolidó con la definición de integración final.';
    } else {
      seen.add(create[1]);
      sql = lastCreate.get(create[1]);
      reason = 'Usar la definición final de integración contable en el primer CREATE.';
    }
  }
  if (/^ALTER TABLE CON_INTEGRACION_MODULO\b/.test(sql)) {
    sql = '';
    reason = 'No aplicar modificaciones del modelo legado DEBE/HABER a la definición final.';
  }
  if (/^ALTER TABLE CON_EJERCICIO_FISCAL ADD \(/.test(compact) && compact.includes('CONSTRAINT')) {
    sql = '';
    reason = 'Las fechas y su CHECK se declaran en el bloque final, sin duplicados.';
  }
  if (/^ALTER TABLE CON_PERIODO_CONTABLE ADD \(/.test(compact) && compact.includes('CONSTRAINT')) {
    sql = '';
    reason = 'Usar PCO_NOMBRE VARCHAR2(30) y CK_CON_PCO_NUM del bloque final.';
  }
  if (
    /^ALTER TABLE CON_CUENTA_CONTABLE ADD \(/.test(compact) &&
    compact.includes('CK_CON_CCO_NATURALEZA')
  ) {
    sql = '';
    reason = 'Usar naturaleza D/H del bloque final y sus columnas de jerarquía y flujo.';
  }
  if (
    /^ALTER TABLE CON_PARTIDA ADD \(PCO_ID/.test(compact) ||
    /^ALTER TABLE CON_PARTIDA ADD \( PAR_NUMERO NUMBER\(10\)/.test(compact)
  ) {
    sql = '';
    reason =
      'Consolidar campos de partida en el bloque final (número de documento VARCHAR2 y USU_ID).';
  }
  if (/^ALTER TABLE CON_ASIENTO ADD \( ASI_LINEA/.test(compact)) {
    sql = sql
      .replace(/\s*CCS_ID NUMBER,/, '')
      .replace(
        /\s*CONSTRAINT FK_CON_ASI_CCS FOREIGN KEY \(CCS_ID\) REFERENCES CON_CENTRO_COSTO \(CCS_ID\),/,
        '',
      );
    reason = 'CCS_ID y su FK ya existen; conservar solo línea, unicidad y validación nuevas.';
  }
  if (
    sql.startsWith('INSERT INTO NOM_PARAMETRO_LABORAL') &&
    sql.includes('BONIFICACION_EXENTA_ISR_IGSS')
  ) {
    sql = sql.replace(
      /'Bonificacion Incentivo \(EML_SALARIO_BONIFICACION_DECRETO\)[^']*'/,
      "'Bonificacion decreto exenta de ISR e IGSS; base salarial: salario ordinario mensual'",
    );
    reason =
      'Acortar NPL_NOMBRE a menos de 150 bytes; conservar código, valor y vigencia originales.';
  }
  if (reason) changes.push({ sourceLine: entry.line, reason });
  if (sql) output.push(sql + (sql.startsWith('BEGIN') ? '\n/' : ';'));
}
writeFileSync(
  new URL('../db/ERP_MAS_NOMINA_CORREGIDO.sql', import.meta.url),
  '-- Versión ejecutable consolidada. Original inmutable: db/source/ERP_MAS_NOMINA_COMPLETO.sql\n-- Definiciones contables finales; detalle de correcciones en docs/cambios-2026-09-11.md.\n\n' +
    output.join('\n\n') +
    '\n',
);
writeFileSync(
  new URL('../db/source/correcciones.json', import.meta.url),
  JSON.stringify(changes, null, 2) + '\n',
);
console.log(
  `${original.length} sentencias de origen; ${output.length} consolidadas; ${changes.length} correcciones documentadas.`,
);
