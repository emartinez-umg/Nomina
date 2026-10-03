// All identifiers below are schema constants. Values are always bound.
const parents = {
  PER_ID: ['ERP_PERSONA', 'PER_ID'],
  JOR_ID: ['NOM_JORNADA', 'JOR_ID'],
  EML_ID: ['NOM_EMPLEADO', 'EML_ID'],
  RLA_ID: ['NOM_RELACION_LABORAL', 'RLA_ID'],
  NOM_ID: ['NOM_NOMINA', 'NOM_ID'],
  NOD_ID: ['NOM_NOMINA_DETALLE', 'NOD_ID'],
  LIL_ID: ['NOM_LIQUIDACION_LABORAL', 'LIL_ID'],
  NPR_ID: ['NOM_PRESTAMO', 'NPR_ID'],
};
export function companyPredicate(table, catalog, alias = 't', depth = 0) {
  if (table.name === 'ERP_PERSONA')
    return `(NOT EXISTS (SELECT 1 FROM NOM_EMPLEADO pe WHERE pe.PER_ID=${alias}.PER_ID) OR EXISTS (SELECT 1 FROM NOM_EMPLEADO pe WHERE pe.PER_ID=${alias}.PER_ID AND pe.EMP_ID=TO_NUMBER(:company)))`;
  if (table.fields.some((f) => f.name === 'EMP_ID')) return `${alias}.EMP_ID=TO_NUMBER(:company)`;
  if (depth > 4) return null;
  for (const [field, [name, pk]] of Object.entries(parents)) {
    if (!table.fields.some((f) => f.name === field && !f.identity)) continue;
    const target = catalog.get(name),
      sub = 'scope' + depth;
    const condition = companyPredicate(target, catalog, sub, depth + 1);
    if (condition)
      return `EXISTS (SELECT 1 FROM ${name} ${sub} WHERE ${sub}.${pk}=${alias}.${field} AND ${condition})`;
  }
  return null;
}
