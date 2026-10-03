import oracledb from 'oracledb';
import Decimal from 'decimal.js';
import { readFileSync } from 'node:fs';
import { parseScript } from './sql-script.js';
export const targetModel = JSON.parse(
  readFileSync(new URL('../../db/schema-erp.json', import.meta.url)),
);
const target = new Map(targetModel.map((t) => [t.name, t]));
export async function snapshotSchema(c, model) {
  const data = {};
  for (const t of model) {
    const expr = t.columns.map((f) =>
      f.type === 'DATE'
        ? `TO_CHAR(${f.name},'YYYY-MM-DD"T"HH24:MI:SS') AS "${f.name}"`
        : f.type === 'TIMESTAMP'
          ? `TO_CHAR(${f.name},'YYYY-MM-DD"T"HH24:MI:SS.FF6') AS "${f.name}"`
          : f.name,
    );
    data[t.name] = (
      await c.execute(
        `SELECT ${expr.join(',')} FROM ${t.name}`,
        {},
        {
          outFormat: oracledb.OUT_FORMAT_OBJECT,
          fetchTypeHandler: (m) =>
            m.dbType === oracledb.DB_TYPE_NUMBER ? { type: oracledb.STRING } : undefined,
        },
      )
    ).rows;
  }
  return data;
}
export function transformLegacy(source) {
  const result = {};
  for (const t of targetModel) result[t.name] = [];
  const tableRename = {
    NOM_TIPO_COMISION: 'NOM_TIPO_INGRESO',
    NOM_COMISION_VENTA: 'NOM_INGRESO_VARIABLE',
  };
  const columnRename = { TCO_ID: 'TIN_ID', TCO_NOMBRE: 'TIN_NOMBRE', TCO_ACTIVO: 'TIN_ACTIVO' };
  // Mocks cannot supply real tax IDs, addresses or credentials. This automatic adapter
  // is intentionally limited to the explicitly identified development fixtures.
  if (source.ERP_EMPRESA?.some((r) => r.NOMBRE !== 'Universidad de ejemplo'))
    throw Error(
      'Se requieren los datos reales del maestro ERP_EMPRESA antes de convertir estos stubs.',
    );
  if (source.CXC_DTE?.some((r) => !r.NOMBRE?.includes('Documento de prueba')))
    throw Error('Se requiere un mapeo de los documentos tributarios reales.');
  const add = (name, row) => {
    result[name].push(row);
    return row;
  };
  add('ERP_PAIS', { PAI_ID: '1', PAI_NOMBRE: 'Guatemala', PAI_CODIGO_ISO: 'GTM' });
  add('ERP_DEPARTAMENTO_GEOGRAFICO', {
    DPT_ID: '1',
    PAI_ID: '1',
    DPT_NOMBRE: 'Departamento de ejemplo',
  });
  add('ERP_MUNICIPIO', { MUN_ID: '1', DPT_ID: '1', MUN_NOMBRE: 'Municipio de ejemplo' });
  add('ERP_ZONA', { ZON_ID: '1', MUN_ID: '1', ZON_NOMBRE: 'Zona de ejemplo' });
  add('ERP_DIRECCION', {
    DIR_ID: '1',
    ZON_ID: '1',
    DIR_DETALLE: 'Dirección de desarrollo pendiente de completar',
  });
  add('ERP_MONEDA', { MON_ID: '1', MON_CODIGO: 'GTQ', MON_NOMBRE: 'Quetzal' });
  for (const r of source.ERP_EMPRESA || [])
    add('ERP_EMPRESA', {
      EMP_ID: r.EMP_ID,
      EMP_RAZON_SOCIAL: r.NOMBRE,
      EMP_NIT: 'DEV-' + r.EMP_ID,
    });
  const company = result.ERP_EMPRESA[0]?.EMP_ID;
  if (!company) throw Error('La migración de demostración requiere una empresa.');
  for (const r of source.ERP_PERSONA || []) {
    const [first, ...last] = r.NOMBRE.split(' ');
    add('ERP_PERSONA', {
      PER_ID: r.PER_ID,
      PER_TIPO: 'F',
      PER_NOMBRES: first,
      PER_APELLIDOS: last.join(' ') || 'Ejemplo',
    });
  }
  let personId = Math.max(0, ...result.ERP_PERSONA.map((r) => Number(r.PER_ID)));
  for (const r of source.ERP_USUARIO || []) {
    const pid = String(++personId);
    add('ERP_PERSONA', {
      PER_ID: pid,
      PER_TIPO: 'F',
      PER_NOMBRES: r.NOMBRE,
      PER_APELLIDOS: 'Desarrollo',
    });
    add('ERP_USUARIO', {
      USU_ID: r.USU_ID,
      PER_ID: pid,
      USU_LOGIN: 'desarrollo_' + r.USU_ID,
      USU_PASSWORD_HASH: '!CUENTA_DE_DESARROLLO_DESHABILITADA!',
    });
  }
  for (const r of source.ERP_SUCURSAL || [])
    add('ERP_SUCURSAL', {
      SUC_ID: r.SUC_ID,
      EMP_ID: company,
      DIR_ID: '1',
      SUC_CODIGO: 'DEV-' + r.SUC_ID,
      SUC_NOMBRE: r.NOMBRE,
    });
  for (const r of source.ERP_DEPARTAMENTO || [])
    add('ERP_DEPARTAMENTO', {
      DPT_ID: r.DPT_ID,
      EMP_ID: company,
      DPT_CODIGO: 'DEV-' + r.DPT_ID,
      DPT_NOMBRE: r.NOMBRE,
    });
  for (const r of source.ERP_BANCO || [])
    add('ERP_BANCO', { BAN_ID: r.BAN_ID, BAN_NOMBRE: r.NOMBRE });
  add('ERP_CLIENTE', { CLI_ID: '1', PER_ID: result.ERP_PERSONA[0].PER_ID, EMP_ID: company });
  add('CXC_TIPO_DTE', { TDE_ID: '1', TDE_NOMBRE: 'FACTURA' });
  add('CXC_ESTADO_DTE', { EDT_ID: '1', EDT_NOMBRE: 'BORRADOR' });
  for (const r of source.CXC_DTE || [])
    add('CXC_DTE', {
      DTE_ID: r.DTE_ID,
      CLI_ID: '1',
      SUC_ID: result.ERP_SUCURSAL[0].SUC_ID,
      MON_ID: '1',
      DTE_SERIE: 'DEV',
      DTE_NUMERO: 'PRUEBA-' + r.DTE_ID,
      DTE_FECHA_EMISION: '2026-09-11T00:00:00.000000',
      DTE_NIT_RECEPTOR: 'DEV',
      DTE_NOMBRE_RECEPTOR: r.NOMBRE,
      DTE_TOTAL: '0',
      TDE_ID: '1',
      EDT_ID: '1',
    });
  for (const [name, rows] of Object.entries(source).filter(([n]) => n.startsWith('NOM_'))) {
    const dest = tableRename[name] || name,
      t = target.get(dest);
    if (!t) throw Error('Tabla no contemplada: ' + name);
    for (const old of rows) {
      const row = {};
      for (const [key, value] of Object.entries(old)) {
        const col =
          columnRename[key] || (name === 'NOM_COMISION_VENTA' ? key.replace(/^CMV_/, 'INV_') : key);
        if (t.columns.some((f) => f.name === col)) row[col] = value;
      }
      if (name === 'NOM_EMPLEADO') {
        row.EML_SALARIO_ORDINARIO_MENSUAL = old.EML_SALARIO;
        row.EML_SALARIO_BONIFICACION_DECRETO = '0';
      }
      if (name === 'NOM_PERIODO') {
        const start = old.NPE_FECHA_INICIO.slice(0, 10),
          end = old.NPE_FECHA_FIN.slice(0, 10);
        if (start.slice(0, 7) !== end.slice(0, 7))
          throw Error('Período fuera de un mes: necesita revisión ' + old.NPE_ID);
        row.NPE_ANIO = start.slice(0, 4);
        row.NPE_MES = String(Number(start.slice(5, 7)));
      }
      if (name === 'NOM_NOMINA') {
        row.EMP_ID = source.NOM_PERIODO.find((p) => p.NPE_ID === old.NPE_ID)?.EMP_ID;
        if (!row.EMP_ID) throw Error('Planilla sin empresa recuperable.');
      }
      if (name === 'NOM_MOVIMIENTO' && old.NMO_TIPO === 'ANTICIPO')
        throw Error(
          'Hay anticipos en movimientos: define su traslado a préstamos antes de migrar.',
        );
      if (name === 'NOM_TRANSFERENCIA_PAGO' && !old.NOD_ID)
        throw Error('Hay pagos de liquidación que el nuevo esquema no admite.');
      if (name === 'NOM_CUENTA_BANCARIA_EMPLEADO' && !row.BAN_ID) {
        row.BAN_ID = result.ERP_BANCO.find((b) => b.BAN_NOMBRE === old.CBE_BANCO)?.BAN_ID;
        if (!row.BAN_ID) throw Error('Cuenta bancaria sin banco normalizado.');
      }
      if (name === 'NOM_AUSENCIA' && !row.TAU_ID) {
        row.TAU_ID = source.NOM_TIPO_AUSENCIA.find((a) => a.TAU_NOMBRE === old.AUS_TIPO)?.TAU_ID;
        if (!row.TAU_ID) throw Error('Ausencia sin tipo normalizado.');
      }
      add(dest, row);
    }
  }
  let relationId = Math.max(0, ...result.NOM_RELACION_LABORAL.map((r) => Number(r.RLA_ID)));
  for (const e of source.NOM_EMPLEADO || [])
    if (!result.NOM_RELACION_LABORAL.some((r) => r.EML_ID === e.EML_ID))
      add('NOM_RELACION_LABORAL', {
        RLA_ID: String(++relationId),
        EML_ID: e.EML_ID,
        PUE_ID: e.PUE_ID,
        SUC_ID: e.SUC_ID,
        DPT_ID: e.DPT_ID,
        RLA_FECHA_INGRESO: e.EML_FECHA_INGRESO,
        RLA_ESTADO: e.EML_ACTIVO === '1' ? 'ACTIVA' : 'FINALIZADA',
        USU_ID_CREA: result.ERP_USUARIO[0].USU_ID,
      });
  for (const row of result.NOM_NOMINA_DETALLE)
    if (!row.RLA_ID) {
      const old = source.NOM_NOMINA_DETALLE.find((r) => r.NOD_ID === row.NOD_ID),
        matches = result.NOM_RELACION_LABORAL.filter((r) => r.EML_ID === old.EML_ID);
      if (matches.length !== 1) throw Error('Detalle de nómina con relación laboral ambigua.');
      row.RLA_ID = matches[0].RLA_ID;
    }
  return result;
}
export async function insertRows(c, data, model = targetModel) {
  const names = new Set(
      Object.entries(data)
        .filter(([, rows]) => rows.length)
        .map(([n]) => n),
    ),
    done = new Set();
  while (names.size) {
    let progress = false;
    for (const name of [...names]) {
      const t = model.find((t) => t.name === name);
      if (!t) throw Error('Unknown table ' + name);
      const deps = t.constraints.filter(
        (x) => x.type === 'R' && x.ref.table !== name && names.has(x.ref.table),
      );
      if (deps.length) continue;
      for (const row of data[name]) {
        const columns = t.columns.filter((f) => Object.hasOwn(row, f.name)),
          binds = {},
          values = columns.map((f, i) => {
            const v = row[f.name];
            binds['v' + i] = v === null ? { val: null, type: oracledb.STRING } : String(v);
            if (f.type === 'DATE')
              return `TO_DATE(:v${i}, '${String(v).includes('T') ? 'YYYY-MM-DD"T"HH24:MI:SS' : 'YYYY-MM-DD'}')`;
            if (f.type === 'TIMESTAMP')
              return `TO_TIMESTAMP(:v${i}, 'YYYY-MM-DD"T"HH24:MI:SS.FF6')`;
            if (f.type === 'NUMBER') return `TO_NUMBER(:v${i})`;
            return ':v' + i;
          });
        await c.execute(
          `INSERT INTO ${name} (${columns.map((f) => f.name).join(',')}) VALUES (${values.join(',')})`,
          binds,
        );
      }
      names.delete(name);
      done.add(name);
      progress = true;
    }
    if (!progress) throw Error('Circular data dependencies: ' + [...names].join(','));
  }
  await c.commit();
  for (const name of done) {
    const identity = model.find((t) => t.name === name).columns.find((c) => c.identity);
    if (identity)
      await c.execute(
        `ALTER TABLE ${name} MODIFY (${identity.name} GENERATED BY DEFAULT AS IDENTITY (START WITH LIMIT VALUE))`,
      );
  }
}
export async function seedCatalogs(c) {
  const source = readFileSync(
    new URL('../../db/ERP_MAS_NOMINA_CORREGIDO.sql', import.meta.url),
    'utf8',
  );
  for (const { sql } of parseScript(source)) {
    if (sql.startsWith('MERGE')) {
      const final = sql
        .replaceAll('NOM_TIPO_COMISION', 'NOM_TIPO_INGRESO')
        .replaceAll('TCO_', 'TIN_');
      await c.execute(final);
    }
  }
  for (const [code, name, value] of [
    ['FACTOR_HORA_EXTRA', 'Factor de hora extra ordinaria', '1.5'],
    ['BONIFICACION_EXENTA_ISR_IGSS', 'Bonificación decreto exenta de ISR e IGSS', '1'],
  ])
    await c.execute(
      `MERGE INTO NOM_PARAMETRO_LABORAL d USING (SELECT EMP_ID FROM ERP_EMPRESA) s ON (d.EMP_ID=s.EMP_ID AND d.NPL_CODIGO=:code AND d.NPL_FECHA_DESDE=DATE '2026-01-01') WHEN NOT MATCHED THEN INSERT (EMP_ID,NPL_CODIGO,NPL_NOMBRE,NPL_VALOR,NPL_FECHA_DESDE) VALUES (s.EMP_ID,:code,:name,TO_NUMBER(:value),DATE '2026-01-01')`,
      { code, name, value },
    );
  await c.commit();
}
export async function validateInstalled(c, expectedRows = {}) {
  const count = (
    await c.execute(
      "SELECT COUNT(*) FROM USER_TABLES WHERE TABLE_NAME NOT IN ('NOM_RH_EVENTO','NOM_RH_REVISION','NOM_RH_VACACION','NOM_RH_PAGO_LIQ','NOM_CORRELATIVO','NOM_USUARIO_PERFIL','NOM_SESION','NOM_RECOMENDACION','NOM_ASUETO')",
    )
  ).rows[0][0];
  if (count !== targetModel.length)
    throw Error(`Expected ${targetModel.length} tables; got ${count}`);
  const invalid = (
    await c.execute(
      "SELECT CONSTRAINT_NAME FROM USER_CONSTRAINTS WHERE STATUS<>'ENABLED' OR VALIDATED<>'VALIDATED'",
    )
  ).rows;
  if (invalid.length) throw Error('Constraints not validated');
  for (const [name, rows] of Object.entries(expectedRows).filter(([, r]) => r.length)) {
    const pk = targetModel.find((t) => t.name === name).constraints.find((c) => c.type === 'P')
      .columns[0];
    for (const r of rows) {
      const fields = targetModel
        .find((t) => t.name === name)
        .columns.filter((f) => Object.hasOwn(r, f.name));
      const select = fields
        .map((f) =>
          f.type === 'DATE'
            ? `TO_CHAR(${f.name},'YYYY-MM-DD"T"HH24:MI:SS') AS "${f.name}"`
            : f.type === 'TIMESTAMP'
              ? `TO_CHAR(${f.name},'YYYY-MM-DD"T"HH24:MI:SS.FF6') AS "${f.name}"`
              : f.name,
        )
        .join(',');
      const result = await c.execute(
        `SELECT ${select} FROM ${name} WHERE ${pk}=TO_NUMBER(:id)`,
        { id: r[pk] },
        {
          outFormat: oracledb.OUT_FORMAT_OBJECT,
          fetchTypeHandler: (m) =>
            m.dbType === oracledb.DB_TYPE_NUMBER ? { type: oracledb.STRING } : undefined,
        },
      );
      if (result.rows.length !== 1) throw Error(`Missing migrated row ${name}.${r[pk]}`);
      for (const f of fields) {
        let expected = r[f.name],
          actual = result.rows[0][f.name];
        if (f.type === 'DATE' && expected !== null && !expected.includes('T'))
          expected += 'T00:00:00';
        const equal =
          expected === null
            ? actual === null
            : f.type === 'NUMBER'
              ? actual !== null && new Decimal(expected).eq(actual)
              : String(expected) === String(actual);
        if (!equal) throw Error(`Migrated value mismatch: ${name}.${f.name}, ID ${r[pk]}`);
      }
    }
  }
  return { tables: count, nomina: targetModel.filter((t) => t.name.startsWith('NOM_')).length };
}
