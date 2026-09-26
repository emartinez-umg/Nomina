import schema from '../../../shared/schema.json' with { type: 'json' };
export const tables = [...schema.tables, ...schema.masters];
export function createCatalog(externalCatalogs = []) {
  // Real ERP catalogs from the consolidated schema; the host can override display columns.
  const externals = schema.externals.map(
    (e) => externalCatalogs.find((x) => x.name === e.name) || e,
  );
  const catalog = new Map([...tables, ...externals].map((t) => [t.name, t]));
  for (const t of catalog.values())
    for (const n of [t.name, t.pk, ...t.fields.map((f) => f.name), ...t.labelFields])
      if (!/^[A-Z][A-Z0-9_]*$/.test(n)) throw Error('Invalid configured SQL identifier');
  return catalog;
}
