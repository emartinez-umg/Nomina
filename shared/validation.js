import { validNit } from './identification.js';
import Decimal from 'decimal.js';
import { birthBounds } from './business-rules.js';
import { stateOptions } from './workflow.js';
import { evaluateCheck, checkFields } from './checks.js';
import { hintFor, isPhone, validPhone } from './field-help.js';
export { hintFor } from './field-help.js';
const byteLength = (s) => new TextEncoder().encode(s).length;
export function validDate(s, timestamp = false) {
  const re = timestamp
    ? /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,6}))?)?$/
    : /^(\d{4})-(\d{2})-(\d{2})$/;
  const m = String(s).match(re);
  if (!m) return false;
  const [, year, month, day, h = '0', min = '0', sec = '0'] = m;
  const y = Number(year),
    mo = Number(month),
    d = Number(day),
    leap = y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0);
  return (
    y >= 1 &&
    mo >= 1 &&
    mo <= 12 &&
    d >= 1 &&
    d <= [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mo - 1] &&
    Number(h) < 24 &&
    Number(min) < 60 &&
    Number(sec) < 60
  );
}
export function validatePayload(table, payload, { create = false } = {}) {
  const errors = {},
    data = {};
  if (!payload || typeof payload !== 'object' || Array.isArray(payload))
    return { data, errors: { _form: 'Envía un objeto con los campos del formulario.' } };
  const editable = table.fields.filter((f) => !f.identity);
  for (const k of Object.keys(payload))
    if (!editable.some((f) => f.name === k)) errors[k] = 'Este campo no se puede modificar.';
  for (const f of editable) {
    if (f.generated && create) continue;
    let v = payload[f.name];
    if (v === undefined && create && f.default !== undefined) {
      if (f.default === 'SYSTIMESTAMP') continue;
      v = f.default;
    }
    if (v === undefined && !create) continue;
    if (v === null || v === undefined || v === '') {
      data[f.name] = null;
      if (f.required) errors[f.name] = 'Este campo es obligatorio.';
      continue;
    }
    if (typeof v !== 'string' && typeof v !== 'number' && typeof v !== 'boolean') {
      errors[f.name] = 'Formato no válido.';
      continue;
    }
    if (typeof v === 'number' && (!Number.isFinite(v) || Math.abs(v) > Number.MAX_SAFE_INTEGER)) {
      errors[f.name] = 'Envía los valores grandes como texto decimal para conservar su precisión.';
      continue;
    }
    if (typeof v === 'boolean') {
      if (!f.boolean) {
        errors[f.name] = 'Formato no válido.';
        continue;
      }
      v = v ? '1' : '0';
    }
    v = String(v);
    if (isPhone(f)) {
      if (!validPhone(v)) {
        errors[f.name] =
          'Ingresa exactamente 8 dígitos, sin letras ni código de país (ej.: 1234-5678).';
        data[f.name] = v;
        continue;
      }
      v = v.replace('-', '');
    }
    if (f.name === 'EMP_NIT') {
      if (!validNit(v))
        errors[f.name] =
          'Escribe un NIT sin espacios, con guion y dígito verificador válido (ej.: 1234567-9).';
      v = v.toUpperCase();
    }
    data[f.name] = v;
    if (f.type === 'NUMBER') {
      if (!/^-?\d+(?:\.\d+)?$/.test(v)) {
        errors[f.name] = 'Ingresa un número sin separadores de miles.';
        continue;
      }
      const decimal = new Decimal(v);
      if (
        decimal.decimalPlaces() > f.scale ||
        decimal.abs().gte(new Decimal(10).pow(f.precision - f.scale))
      )
        errors[f.name] = `Admite ${f.precision - f.scale} dígitos enteros y ${f.scale} decimales.`;
    } else if (f.type === 'VARCHAR2') {
      if (byteLength(v) > f.maxLength)
        errors[f.name] = `El texto supera ${f.maxLength} bytes UTF-8.`;
      if (f.input === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v))
        errors[f.name] = 'Ingresa un correo válido.';
      if (f.input === 'time' && !/^([01]\d|2[0-3]):[0-5]\d$/.test(v))
        errors[f.name] = 'Usa una hora válida entre 00:00 y 23:59.';
    } else if (!validDate(v, f.type === 'TIMESTAMP'))
      errors[f.name] =
        f.type === 'DATE' ? 'Ingresa una fecha válida.' : 'Ingresa una fecha y hora local válidas.';
    else if (f.type === 'TIMESTAMP') {
      const [date, time] = v.split('T');
      const [clock, fraction = ''] = time.split('.');
      data[f.name] =
        `${date}T${clock.length === 5 ? clock + ':00' : clock}.${fraction.padEnd(6, '0')}`;
    }
    if (stateOptions(f) && !stateOptions(f).includes(v))
      errors[f.name] = `Selecciona: ${stateOptions(f).join(', ')}.`;
    if (f.name === 'PER_FECHA_NACIMIENTO' && validDate(v)) {
      const { min, max } = birthBounds();
      if (v < min || v > max) errors[f.name] = `Selecciona una fecha entre ${min} y ${max}.`;
    }
  }
  if (
    table.name === 'NOM_TRANSFERENCIA_PAGO' &&
    data.TRP_ESTADO === 'CONFIRMADA' &&
    !data.TRP_REFERENCIA?.trim()
  )
    errors.TRP_REFERENCIA = 'Ingresa la referencia bancaria para confirmar el pago.';
  for (const c of table.checks) {
    if (evaluateCheck(c.ast, data) === false) {
      const fields = checkFields(c.ast),
        labels = fields.map((n) => table.fields.find((f) => f.name === n)?.label || n);
      let message =
        fields.length === 1
          ? `Revisa ${labels[0].toLowerCase()}: ${hintFor(table.fields.find((f) => f.name === fields[0]))}`
          : `Revisa la relación entre ${labels.join(', ')}.`;
      if (c.name === 'CK_TRP_ORIGEN')
        message = 'Selecciona exactamente un origen: detalle de planilla o liquidación laboral.';
      else if (/FECHAS|MARCAS/.test(c.name))
        message = 'La fecha u hora final debe ser igual o posterior a la inicial.';
      else if (c.name === 'CK_NOM_JRL_DISTINTOS')
        message = 'El jefe y el subordinado deben ser relaciones laborales diferentes.';
      for (const f of fields) errors[f] ??= message;
    }
  }
  return { data, errors };
}
