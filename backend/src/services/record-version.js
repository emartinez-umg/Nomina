import { createHash } from 'node:crypto';
import { ApiError } from '../repositories/repository.js';
export function recordVersion(table, row) {
  return createHash('sha256')
    .update(JSON.stringify(table.fields.map((f) => [f.name, row[f.name] ?? null])))
    .digest('hex');
}
export function assertVersion(table, row, expected) {
  if (expected && expected !== recordVersion(table, row))
    throw new ApiError(
      409,
      'Otra persona modificó este registro. Tus cambios se conservaron en el borrador; vuelve a abrir el registro para comparar antes de guardar.',
      {},
      'STALE_RECORD',
    );
}
