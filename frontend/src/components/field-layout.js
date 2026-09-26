import { isPhone } from '../../../shared/field-help.js';
import { friendlyOptions } from '../../../shared/hr-catalog.js';

// Presentation only: database limits, input types and validation stay in the schema.
export function fieldLayout(field) {
  let size = 'wide';
  let width = '100%';
  const fit = (characters, padding = 2) => `calc(${characters}ch + ${padding}rem)`;

  if (field.ref) {
    // References display names, even though their stored values are numeric IDs.
    size = field.ref.table === 'ERP_DIRECCION' ? 'full' : 'wide';
  } else if (field.boolean) {
    size = 'compact';
  } else if (isPhone(field)) {
    size = 'compact';
    width = fit(10);
  } else if (field.options) {
    const labels = field.options.map((value) => friendlyOptions[field.name]?.[value] || value);
    const characters = Math.max(
      ...labels.map((label) => label.length),
      `Selecciona ${field.label || ''}…`.length,
      field.name === 'JOD_DIA_SEMANA' ? 15 : field.name === 'NPE_MES' ? 12 : 0,
    );
    size = characters > 28 ? 'wide' : 'medium';
    width = fit(characters, 3);
  } else if (field.input === 'time') {
    size = 'compact';
    width = fit(10, 3);
  } else if (field.type === 'DATE' || field.input === 'date') {
    size = 'medium';
    width = fit(12, 3);
  } else if (field.type === 'TIMESTAMP' || field.input === 'datetime-local') {
    size = 'wide';
    width = fit(29, 3);
  } else if (field.type === 'NUMBER') {
    const characters = (field.precision || 18) + (field.scale ? 1 : 0) + 1;
    size = characters <= 12 ? 'compact' : characters <= 24 ? 'medium' : 'wide';
    width = fit(Math.max(7, characters), 3);
  } else if (field.input === 'email' || /_CORREO$/.test(field.name)) {
    size = 'wide';
  } else if (
    field.maxLength >= 200 ||
    /_(DIRECCION|DETALLE|DESCRIPCION|OBSERVACION|MOTIVO|RAZON_SOCIAL)$/.test(field.name)
  ) {
    size = 'full';
  } else if (field.maxLength <= 24) {
    size = field.maxLength <= 12 ? 'compact' : 'medium';
    width = fit(Math.max(7, field.maxLength));
  } else if (field.maxLength <= 50) {
    width = fit(field.maxLength);
  }

  return {
    className: `form-field form-field--${size}`,
    style: { '--field-control-width': width },
  };
}
