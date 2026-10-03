import { ApiError, createRepository } from '../repositories/repository.js';
import { executeOptions } from '../config/pool.js';
import { audit } from './workflow.js';
export async function removePeriod(c, catalog, id, context) {
  const table = catalog.get('NOM_PERIODO');
  const repo = createRepository(table, catalog);
  const before = await repo.get(c, id, true);
  if (!before.NPE_ESTADO || before.NPE_ESTADO === 'ANULADO')
    throw new ApiError(409, 'El período ya está anulado o no admite esta operación.');
  const dependencies = [];
  for (const t of catalog.values()) {
    const f = t.fields.find((f) => f.ref?.table === 'NOM_PERIODO');
    if (!f) continue;
    const r = await c.execute(
      `SELECT COUNT(*) AS "total" FROM ${t.name} WHERE ${f.name}=TO_NUMBER(:id)`,
      { id },
      executeOptions,
    );
    if (Number(r.rows[0].total))
      dependencies.push(`${r.rows[0].total} registro(s) en ${t.title || t.name}`);
  }
  if (before.NPE_ESTADO === 'ABIERTO') {
    if (dependencies.length)
      throw new ApiError(
        409,
        `No se puede eliminar el período: tiene ${dependencies.join(', ')}.`,
        {},
        'PERIOD_HAS_DEPENDENCIES',
      );
    await repo.remove(c, id);
    await audit(c, catalog, table.name, id, 'ELIMINAR', before, null, context);
    return;
  }
  const active = await c.execute(
    'SELECT COUNT(*) AS "total" FROM NOM_NOMINA WHERE NPE_ID=TO_NUMBER(:id) AND NOM_ESTADO<>\'ANULADA\'',
    { id },
    executeOptions,
  );
  if (Number(active.rows[0].total))
    throw new ApiError(
      409,
      'El período conserva planillas vigentes o pagadas. Revisa sus planillas antes de anularlo.',
      {},
      'PERIOD_HAS_PAYROLL',
    );
  await repo.update(c, id, { NPE_ESTADO: 'ANULADO' });
  await audit(
    c,
    catalog,
    table.name,
    id,
    'ANULAR',
    before,
    { ...before, NPE_ESTADO: 'ANULADO' },
    context,
  );
}
