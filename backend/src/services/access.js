import { ApiError } from '../repositories/repository.js';
import { companyPredicate } from '../repositories/scope.js';
import { executeOptions } from '../config/pool.js';
import { canUseTable, roles } from '../../../shared/access.js';
export function requireRole(actor, allowed) {
  if (actor?.verified && !allowed.includes(actor.role))
    throw new ApiError(403, 'Tu rol no permite esta acción.', {}, 'FORBIDDEN');
}
export function scopedQuery(actor, table, catalog, query = {}) {
  if (
    !actor?.role ||
    !companyPredicate(table, catalog) ||
    (actor.role === roles.SYSTEM && table.name === 'ERP_EMPRESA')
  )
    return query;
  if (query.company && String(query.company) !== actor.companyId)
    throw new ApiError(403, 'Cambia primero la empresa de trabajo.');
  return { ...query, company: actor.companyId };
}
export async function assertRowAccess(c, actor, table, catalog, id) {
  if (!actor?.role || (actor.role === roles.SYSTEM && table.name === 'ERP_EMPRESA')) return;
  const condition = companyPredicate(table, catalog);
  if (!condition) return;
  const r = await c.execute(
    `SELECT t.${table.pk} FROM ${table.name} t WHERE t.${table.pk}=TO_NUMBER(:id) AND ${condition}`,
    { id: String(id), company: actor.companyId },
    executeOptions,
  );
  if (!r.rows.length)
    throw new ApiError(403, 'Este registro no pertenece a tu empresa de trabajo.', {}, 'FORBIDDEN');
}
export async function assertInputAccess(c, actor, table, catalog, data) {
  if (!actor?.role) return;
  if (data.EMP_ID && String(data.EMP_ID) !== actor.companyId)
    throw new ApiError(403, 'Selecciona la empresa de tu sesión.');
  for (const f of table.fields.filter((f) => f.ref && data[f.name])) {
    const target = catalog.get(f.ref.table);
    if (target) await assertRowAccess(c, actor, target, catalog, data[f.name]);
  }
}
export function authorizeTable(actor, table, write = false) {
  if (actor?.role && !canUseTable(actor.role, table, write))
    throw new ApiError(403, 'Tu rol no permite abrir o modificar esta sección.', {}, 'FORBIDDEN');
}
export function creatorFields(actor, body, table) {
  if (!actor?.role || !body || typeof body !== 'object' || Array.isArray(body)) return body;
  const result = { ...body };
  for (const f of table.fields) if (f.name === 'USU_ID_CREA') result[f.name] = actor.id;
  return result;
}
export { roles };
