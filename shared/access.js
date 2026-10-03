export const roles = {
  SYSTEM: 'NOMINA_SISTEMA',
  PAYROLL: 'NOMINA_ADMIN',
  EMPLOYEE: 'NOMINA_COLABORADOR',
};
export const roleLabels = {
  NOMINA_SISTEMA: 'Administrador del Sistema',
  NOMINA_ADMIN: 'Administrador de Nómina',
  NOMINA_COLABORADOR: 'Colaborador',
};
const settings = new Set(['organizacion', 'ubicaciones', 'parametros', 'catalogos']);
export function canUseTable(role, table, write = false) {
  if (role === roles.SYSTEM) return true;
  if (role !== roles.PAYROLL) return false;
  return !write || !settings.has(table.group);
}
export function canOpenPage(role, slug, tables = []) {
  if (role === roles.SYSTEM) return true;
  if (['mi-informacion', 'calendario', 'recomendaciones', 'guia'].includes(slug)) return true;
  if (role === roles.EMPLOYEE) return false;
  if (['dashboard', 'alta-empleado', 'expediente', 'revision'].includes(slug)) return true;
  const table = tables.find((t) => t.slug === slug);
  return !!table && canUseTable(role, table);
}
