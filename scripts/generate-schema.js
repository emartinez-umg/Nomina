import { readFileSync, writeFileSync } from 'node:fs';
import {
  groups,
  titles,
  fieldLabel,
  labelFields,
  fieldHints,
  descriptions,
} from '../shared/catalog.js';
import { exampleFor, isPhone } from '../shared/field-help.js';
import { masterDefinitions } from '../shared/hr-catalog.js';
import { parseCheck, enumValues } from '../shared/checks.js';
const model = JSON.parse(readFileSync(new URL('../db/schema-erp.json', import.meta.url)));
function metadata(raw, external = false) {
  const short = raw.name.slice(4),
    pk = raw.constraints.find((c) => c.type === 'P')?.columns[0];
  const t = {
    name: raw.name,
    pk,
    ...(external
      ? { external: true }
      : {
          slug: short.toLowerCase().replaceAll('_', '-'),
          title: titles[short],
          group: groups.find((g) => g.tables.includes(short))?.id,
          description: descriptions[raw.name],
        }),
    fields: raw.columns.map((c) => ({
      name: c.name,
      label: fieldLabel(c.name),
      type: c.type,
      required: c.required,
      identity: c.identity,
      ...(c.type === 'NUMBER' ? { precision: c.precision ?? 38, scale: c.scale ?? 0 } : {}),
      ...(['VARCHAR2', 'CHAR'].includes(c.type) ? { maxLength: c.length } : {}),
      ...(!c.identity && c.default !== null ? { default: c.default.replace(/^'|'$/g, '') } : {}),
      ...(c.name.includes('_HORA_') && c.type === 'VARCHAR2' ? { input: 'time' } : {}),
      ...(fieldHints[c.name] ? { hint: fieldHints[c.name] } : {}),
    })),
    checks: raw.constraints
      .filter((c) => c.type === 'C')
      .map((c) => ({
        name: c.name,
        sql: c.sql.replaceAll('"', ''),
        ast: parseCheck(c.sql.replaceAll('"', '')),
      })),
    unique: raw.constraints
      .filter((c) => c.type === 'U')
      .map((c) => ({ name: c.name, fields: c.columns })),
  };
  for (const c of raw.constraints.filter((c) => c.type === 'R')) {
    if (c.columns.length !== 1)
      throw Error('Composite FK needs an explicit form adapter: ' + c.name);
    t.fields.find((f) => f.name === c.columns[0]).ref = {
      table: c.ref.table,
      pk: c.ref.columns[0],
      constraint: c.name,
    };
  }
  for (const f of t.fields) {
    for (const c of t.checks) {
      const options = enumValues(c.ast, f.name);
      if (options?.length) f.options = options;
      const n = c.sql.match(new RegExp('\\b' + f.name + '\\s*(>=|>)\\s*(\\d+)(?:\\D|$)'));
      if (n) {
        f.min = n[2];
        f.exclusiveMin = n[1] === '>';
      }
    }
    f.boolean =
      f.type === 'NUMBER' &&
      (f.options?.join(',') === '0,1' || /_(ACTIVO|ACTIVA|AFECTA_IGSS|AFECTA_ISR)$/.test(f.name));
    if (f.name === 'JOD_DIA_SEMANA') f.options = ['1', '2', '3', '4', '5', '6', '7'];
    if (f.name === 'NPE_MES') f.options = Array.from({ length: 12 }, (_, i) => String(i + 1));
  }
  const active = t.fields.find((f) => /_ACTIV[OA]$/.test(f.name)),
    state = t.fields.find((f) => f.name.endsWith('_ESTADO'));
  t.lifecycle = active
    ? { mode: 'inactive', field: active.name, value: '0', label: 'Inactivar' }
    : state?.options?.some((v) => /^ANULAD[OA]$/.test(v))
      ? {
          mode: 'cancel',
          field: state.name,
          value: state.options.find((v) => /^ANULAD[OA]$/.test(v)),
          label: 'Anular',
        }
      : state
        ? { mode: 'state', field: state.name, label: 'Editar estado' }
        : { mode: 'delete', label: 'Eliminar' };
  t.labelFields = labelFields[t.name] || [
    t.fields.find((f) => f.name.endsWith('_NOMBRE'))?.name ||
      t.fields.find((f) => f.type === 'VARCHAR2')?.name ||
      pk,
  ];
  for (const f of t.fields) {
    if (isPhone(f)) f.input = 'tel';
    if (/_CORREO$/.test(f.name)) f.input = 'email';
    f.example = exampleFor(f, t.name);
  }
  return t;
}
const tables = groups.flatMap((g) =>
  g.tables.map((short) => {
    const raw = model.find((t) => t.name === 'NOM_' + short);
    if (!raw) throw Error('Missing ' + short);
    return metadata(raw);
  }),
);
const masters = Object.entries(masterDefinitions).map(([name, [title, group, labels]]) => {
  const t = metadata(model.find((t) => t.name === name));
  Object.assign(t, {
    slug: 'erp-' + name.slice(4).toLowerCase().replaceAll('_', '-'),
    title,
    group,
    labelFields: labels,
  });
  if (name === 'ERP_PERSONA') t.labelMode = 'person';
  for (const f of t.fields) {
    if (f.ref?.table === 'ERP_DEPARTAMENTO_GEOGRAFICO') f.label = 'Departamento geográfico';
    if (f.ref?.table === 'ERP_TIPO_DOCUMENTO_IDENTIDAD') f.label = 'Tipo de documento';
    if (f.name === 'PCO_CORREO') f.input = 'email';
    if (f.name === 'PTE_NUMERO') f.input = 'tel';
  }
  return t;
});
const externalNames = [
  ...new Set(
    [...tables, ...masters].flatMap((t) =>
      t.fields
        .filter((f) => f.ref && !f.ref.table.startsWith('NOM_') && !masterDefinitions[f.ref.table])
        .map((f) => f.ref.table),
    ),
  ),
];
const externals = externalNames.map((name) => {
  const raw = model.find((t) => t.name === name),
    labels = labelFields[name];
  if (!raw || !labels) throw Error('Missing real ERP catalog ' + name);
  const pk = raw.constraints.find((c) => c.type === 'P').columns[0];
  return {
    name,
    pk,
    external: true,
    title: name,
    labelFields: labels,
    ...(name === 'ERP_PERSONA' ? { labelMode: 'person' } : {}),
    fields: raw.columns
      .filter((c) =>
        [
          pk,
          ...labels,
          ...(name === 'ERP_PERSONA' ? ['PER_TIPO', 'PER_RAZON_SOCIAL'] : []),
        ].includes(c.name),
      )
      .map((c) => ({
        name: c.name,
        type: c.type,
        ...(c.type === 'NUMBER' ? { precision: c.precision ?? 38, scale: c.scale ?? 0 } : {}),
        ...(c.type === 'VARCHAR2' ? { maxLength: c.length } : {}),
      })),
  };
});
if (tables.length !== 35 || tables.some((t) => !t.group || !t.pk || !t.title))
  throw Error('Incomplete schema');
for (const t of [...tables, ...masters, ...externals])
  for (const n of t.labelFields)
    if (!t.fields.some((f) => f.name === n))
      throw Error('Invalid display field ' + t.name + '.' + n);
writeFileSync(
  new URL('../shared/schema.json', import.meta.url),
  JSON.stringify({ version: '2026-09-11-hr', tables, masters, externals }, null, 2) + '\n',
);
console.log(
  `Esquema: ${model.length} tablas ERP, ${tables.length} formularios NOM, ${tables.reduce((n, t) => n + t.checks.length, 0)} CHECK.`,
);
