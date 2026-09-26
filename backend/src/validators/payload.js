import { validatePayload } from '../../../shared/validation.js';
import { ApiError } from '../repositories/repository.js';
export function payload(table, body, options) {
  const result = validatePayload(table, body, options);
  if (Object.keys(result.errors).length)
    throw new ApiError(422, 'Revisa los campos indicados.', result.errors, 'VALIDATION_ERROR');
  return result.data;
}
export function identifier(value) {
  if (!/^\d{1,38}$/.test(value)) throw new ApiError(400, 'Identificador no válido.');
  return value;
}
