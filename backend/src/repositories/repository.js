import { employeeCode } from '../services/correlatives.js';
import { validDate } from '../../../shared/validation.js';
import { checklist } from '../services/checklist.js';
import { companyPredicate } from './scope.js';
import oracledb from 'oracledb';
import { executeOptions } from '../config/pool.js';
export class ApiError extends Error {
  constructor(status, message, fields = {}, code = 'REQUEST_ERROR') {
    super(message);
    this.status = status;
    this.fields = fields;
    this.code = code;
  }
}
export function bindExpression(f, key) {
  if (f.type === 'DATE') return `TO_DATE(:${key}, 'YYYY-MM-DD')`;
  if (f.type === 'TIMESTAMP') return `TO_TIMESTAMP(:${key}, 'YYYY-MM-DD"T"HH24:MI:SS.FF6')`;
  if (f.type === 'NUMBER') return `TO_NUMBER(:${key})`;
  return `:${key}`;
}
function normalizeBind(f, value) {
  if (value === null) return { val: null, type: oracledb.STRING };
  if (f.type === 'TIMESTAMP') {
    const [date, time] = value.split('T');
    const [clock, fraction = ''] = time.split('.');
    return `${date}T${clock.length === 5 ? clock + ':00' : clock}.${fraction.padEnd(6, '0')}`;
  }
  return String(value);
}
export function scalar(f, alias = 't') {
  const c = `${alias}.${f.name}`;
  return f.type === 'DATE'
    ? `TO_CHAR(${c}, 'YYYY-MM-DD')`
    : f.type === 'TIMESTAMP'
      ? `TO_CHAR(${c}, 'YYYY-MM-DD"T"HH24:MI:SS.FF6')`
      : f.type === 'NUMBER'
        ? `TO_CHAR(${c}, 'TM9', 'NLS_NUMERIC_CHARACTERS=''.,''')`
        : c;
}
export function labelSql(table, catalog, alias = 't', depth = 0) {
  if (table.labelMode === 'person')
    return `CASE WHEN ${alias}.PER_TIPO = 'J' THEN ${alias}.PER_RAZON_SOCIAL ELSE TRIM(${alias}.PER_NOMBRES || ' ' || ${alias}.PER_APELLIDOS) END`;
  return table.labelFields
    .map((name, index) => {
      const f = table.fields.find((f) => f.name === name);
      if (!f) throw Error('Unknown configured display field ' + name);
      if (f.ref && depth < 4) {
        const target = catalog.get(f.ref.table),
          sub = `l${depth}_${index}`;
        return `(SELECT ${labelSql(target, catalog, sub, depth + 1)} FROM ${target.name} ${sub} WHERE ${sub}.${target.pk}=${alias}.${f.name})`;
      }
      return scalar(f, alias);
    })
    .join(" || ' · ' || ");
}
export function listQuery(table, catalog, query = {}) {
  const page = Number(query.page ?? 1),
    pageSize = Number(query.pageSize ?? 20);
  if (
    !Number.isSafeInteger(page) ||
    page < 1 ||
    page > 10000000 ||
    !Number.isInteger(pageSize) ||
    pageSize < 1 ||
    pageSize > 100
  )
    throw new ApiError(400, 'Paginación no válida.');
  const sort = String(query.sort ?? table.pk),
    direction = String(query.direction ?? 'asc').toUpperCase();
  if (!table.fields.some((f) => f.name === sort) || !['ASC', 'DESC'].includes(direction))
    throw new ApiError(400, 'Ordenamiento no válido.');
  const q = String(query.q ?? '').trim();
  if (q.length > 150) throw new ApiError(400, 'La búsqueda admite hasta 150 caracteres.');
  let where = [],
    binds = {};
  if (q) {
    binds.search = `%${q.toUpperCase().replace(/[\\%_]/g, '\\$&')}%`;
    let expr = table.fields
      .filter((f) => !f.identity)
      .map((f) =>
        f.ref
          ? `(SELECT ${labelSql(catalog.get(f.ref.table), catalog, 's')} FROM ${f.ref.table} s WHERE s.${f.ref.pk}=t.${f.name})`
          : scalar(f),
      );
    where.push('(' + expr.map((s) => `UPPER(${s}) LIKE :search ESCAPE '\\'`).join(' OR ') + ')');
  }
  if (query.filterField) {
    const f = table.fields.find((f) => f.name === query.filterField);
    if (!f) throw new ApiError(400, 'Filtro no válido.');
    if (
      ['DATE', 'TIMESTAMP'].includes(f.type) &&
      !validDate(String(query.filterValue ?? ''), f.type === 'TIMESTAMP')
    )
      throw new ApiError(400, 'Fecha del filtro no válida.');
    binds.filter = String(query.filterValue ?? '');
    where.push(`t.${f.name}=${bindExpression(f, 'filter')}`);
  }
  if (query.company) {
    if (!/^\d{1,38}$/.test(String(query.company))) throw new ApiError(400, 'Empresa no válida.');
    binds.company = String(query.company);
    const condition = companyPredicate(table, catalog);
    if (!condition)
      throw new ApiError(400, 'El filtro de empresa no está disponible para esta vista.');
    where.push(condition);
  }
  for (const [key, value] of Object.entries(query).filter(([k]) => k.startsWith('filter_'))) {
    const f = table.fields.find((f) => f.name === key.slice(7));
    if (!f || String(value).length > 150) throw new ApiError(400, 'Filtro no válido.');
    if (['DATE', 'TIMESTAMP'].includes(f.type) && !validDate(String(value), f.type === 'TIMESTAMP'))
      throw new ApiError(400, 'Fecha del filtro no válida.');
    binds[key] = String(value);
    where.push(`t.${f.name}=${bindExpression(f, key)}`);
  }
  if (query.pending === '1' && table.name === 'NOM_MARCAJE')
    where.push(
      '(t.MRC_ENTRADA IS NULL OR t.MRC_SALIDA IS NULL) AND t.AUS_ID IS NULL AND t.VAC_ID IS NULL',
    );
  if (query.pending === '1' && table.name === 'NOM_EMPLEADO')
    where.push(
      't.EML_ACTIVO=1 AND (' +
        Object.values(checklist('t'))
          .map((s) => '(' + s + ')')
          .join(' OR ') +
        ')',
    );
  if (query.employee) {
    if (!/^\d{1,38}$/.test(String(query.employee)) || table.name !== 'NOM_MARCAJE')
      throw new ApiError(400, 'Empleado no válido.');
    binds.employee = String(query.employee);
    where.push(
      'EXISTS (SELECT 1 FROM NOM_RELACION_LABORAL er WHERE er.RLA_ID=t.RLA_ID AND er.EML_ID=TO_NUMBER(:employee))',
    );
  }
  if (query.dateField) {
    const f = table.fields.find(
      (f) => f.name === query.dateField && ['DATE', 'TIMESTAMP'].includes(f.type),
    );
    if (!f) throw new ApiError(400, 'Campo de fecha no válido.');
    for (const side of ['from', 'to'])
      if (query[side]) {
        if (!validDate(String(query[side]))) throw new ApiError(400, 'Fecha no válida.');
        binds['range_' + side] = String(query[side]);
        where.push(
          `t.${f.name}${side === 'from' ? '>=' : '<'}TO_DATE(:range_${side},'YYYY-MM-DD')${side === 'to' ? '+1' : ''}`,
        );
      }
    if (query.from && query.to && query.from > query.to)
      throw new ApiError(400, 'La fecha final debe ser posterior a la inicial.');
  }

  const clause = where.length ? ' WHERE ' + where.join(' AND ') : '';
  const columns = table.fields.map(
    (f) => `${f.type === 'NUMBER' ? `t.${f.name}` : scalar(f)} AS "${f.name}"`,
  );
  for (const f of table.fields.filter((f) => f.ref)) {
    const target = catalog.get(f.ref.table);
    columns.push(
      `(SELECT ${labelSql(target, catalog, 's')} FROM ${target.name} s WHERE s.${target.pk}=t.${f.name}) AS "__LABEL_${f.name}"`,
    );
  }
  return {
    sql: `SELECT ${columns.join(', ')} FROM ${table.name} t${clause} ORDER BY t.${sort} ${direction}${sort !== table.pk ? `, t.${table.pk} ASC` : ''} OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY`,
    countSql: `SELECT COUNT(*) AS "total" FROM ${table.name} t${clause}`,
    binds,
    page,
    pageSize,
  };
}
export function createRepository(table, catalog) {
  const run = (c, s, b = {}) => c.execute(s, b, executeOptions);
  return {
    async list(c, query) {
      const built = listQuery(table, catalog, query);
      const count = await run(c, built.countSql, built.binds);
      const result = await run(c, built.sql, {
        ...built.binds,
        offset: (built.page - 1) * built.pageSize,
        limit: built.pageSize,
      });
      return {
        rows: result.rows,
        total: Number(count.rows[0].total),
        page: built.page,
        pageSize: built.pageSize,
      };
    },
    async get(c, id, lock = false) {
      const columns = table.fields
        .map((f) => `${f.type === 'NUMBER' ? `t.${f.name}` : scalar(f)} AS "${f.name}"`)
        .join(', ');
      const result = await run(
        c,
        `SELECT ${columns} FROM ${table.name} t WHERE t.${table.pk}=TO_NUMBER(:id)${lock ? ' FOR UPDATE' : ''}`,
        { id },
      );
      if (!result.rows.length) throw new ApiError(404, 'El registro ya no existe.');
      return result.rows[0];
    },
    async create(c, data) {
      if (table.name === 'NOM_EMPLEADO')
        data = { ...data, EML_CODIGO: await employeeCode(c, data.EMP_ID) };
      const fields = table.fields.filter((f) => Object.hasOwn(data, f.name) && !f.identity),
        binds = { id: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 80 } };
      fields.forEach((f, i) => (binds['v' + i] = normalizeBind(f, data[f.name])));
      const result = await c.execute(
        `INSERT INTO ${table.name} (${fields.map((f) => f.name).join(', ')}) VALUES (${fields.map((f, i) => bindExpression(f, 'v' + i)).join(', ')}) RETURNING ${table.pk} INTO :id`,
        binds,
      );
      return String(result.outBinds.id[0]);
    },
    async update(c, id, data) {
      const fields = table.fields.filter((f) => Object.hasOwn(data, f.name) && !f.identity);
      if (!fields.length) return;
      const binds = { id };
      fields.forEach((f, i) => (binds['v' + i] = normalizeBind(f, data[f.name])));
      await c.execute(
        `UPDATE ${table.name} SET ${fields.map((f, i) => `${f.name}=${bindExpression(f, 'v' + i)}`).join(', ')} WHERE ${table.pk}=TO_NUMBER(:id)`,
        binds,
      );
    },
    async remove(c, id) {
      await c.execute(`DELETE FROM ${table.name} WHERE ${table.pk}=TO_NUMBER(:id)`, { id });
    },
  };
}
export async function lookup(connection, table, catalog, query = {}) {
  const { q = '', page = '1', id } = query;
  const pageNumber = Number(page);
  if (
    !Number.isInteger(pageNumber) ||
    pageNumber < 1 ||
    pageNumber > 1000000 ||
    String(q).length > 150
  )
    throw new ApiError(400, 'Búsqueda no válida.');
  const expr = labelSql(table, catalog),
    binds = { offset: (pageNumber - 1) * 25, limit: 26 };
  let where = '';
  if (id !== undefined) {
    if (!/^\d{1,38}$/.test(String(id))) throw new ApiError(400, 'Identificador no válido.');
    where = ` WHERE t.${table.pk}=TO_NUMBER(:id)`;
    binds.id = String(id);
  } else if (q) {
    where = ` WHERE UPPER(${expr}) LIKE :search ESCAPE '\\'`;
    binds.search = `%${String(q)
      .toUpperCase()
      .replace(/[\\%_]/g, '\\$&')}%`;
  }
  if (id === undefined) {
    if (query.company) {
      if (!/^\d{1,38}$/.test(String(query.company))) throw new ApiError(400, 'Empresa no válida.');
      const condition = companyPredicate(table, catalog);
      if (!condition) throw new ApiError(400, 'El catálogo no admite empresa.');
      binds.company = String(query.company);
      where += (where ? ' AND ' : ' WHERE ') + condition;
    }
    for (const [key, value] of Object.entries(query).filter(([k]) => k.startsWith('filter_'))) {
      const f = table.fields.find((f) => f.name === key.slice(7));
      if (!f || String(value).length > 150)
        throw new ApiError(400, 'Filtro de catálogo no válido.');
      where += (where ? ' AND ' : ' WHERE ') + `t.${f.name}=${bindExpression(f, key)}`;
      if (
        ['DATE', 'TIMESTAMP'].includes(f.type) &&
        !validDate(String(value), f.type === 'TIMESTAMP')
      )
        throw new ApiError(400, 'Fecha del filtro no válida.');
      binds[key] = String(value);
    }
  }
  const r = await connection.execute(
    `SELECT t.${table.pk} AS "value", ${expr} AS "label" FROM ${table.name} t${where} ORDER BY ${expr},t.${table.pk} OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY`,
    binds,
    executeOptions,
  );
  return { options: r.rows.slice(0, 25), hasMore: r.rows.length > 25, page: pageNumber };
}
