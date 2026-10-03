import { calculateVacation, vacationSnapshot } from './vacations.js';
import Decimal from 'decimal.js';
import oracledb from 'oracledb';
import { createHash } from 'node:crypto';
import { ApiError, createRepository } from '../repositories/repository.js';
import { executeOptions } from '../config/pool.js';
import { identifier } from '../validators/payload.js';
import { paymentStates, reconcile } from '../../../shared/workflow.js';
const run = async (c, sql, binds = {}) =>
  (await c.execute(sql, binds, executeOptions)).rows.map((row) =>
    Object.fromEntries(
      Object.entries(row).map(([k, v]) => [
        k,
        v instanceof Date
          ? `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}-${String(v.getDate()).padStart(2, '0')}`
          : v,
      ]),
    ),
  );
const fail = (message, field) => {
  throw new ApiError(422, message, field ? { [field]: message } : {});
};
const get = (c, catalog, name, id, lock = false) =>
  createRepository(catalog.get(name), catalog).get(c, String(id), lock);
const money = (v) => {
  if (!/^\d{1,16}(\.\d{1,2})?$/.test(String(v)))
    fail('Ingresa un monto válido, con hasta dos decimales.');
  return new Decimal(v);
};
const text = (v, max = 500) => {
  if (typeof v !== 'string' || !v.trim() || v.trim().length > max)
    fail(`Escribe un motivo o referencia de hasta ${max} caracteres.`);
  return v.trim();
};
const date = (v) => {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(String(v)) ||
    Number.isNaN(Date.parse(v)) ||
    new Date(v).toISOString().slice(0, 10) !== v
  )
    fail('Ingresa una fecha válida.');
  return v;
};
export function changeContext(req) {
  let reason = '';
  try {
    reason = decodeURIComponent(req.get('X-Change-Reason') || '');
  } catch {
    fail('Motivo no válido.');
  }
  if (reason.length > 500) fail('El motivo admite hasta 500 caracteres.');
  return {
    actor: req.nominaActor || {
      label: 'Operador local · identidad no autenticada',
      verified: false,
    },
    reason,
    effective: req.get('X-Effective-Date') ? date(req.get('X-Effective-Date')) : null,
  };
}
export async function audit(c, catalog, entity, id, action, before, after, context = {}) {
  let employee = after?.EML_ID || before?.EML_ID || (entity === 'NOM_EMPLEADO' ? id : null);
  const relation = after?.RLA_ID || before?.RLA_ID;
  if (!employee && relation)
    employee = (await get(c, catalog, 'NOM_RELACION_LABORAL', relation)).EML_ID;
  const actor = context.actor || {
    label: 'Operador local · identidad no autenticada',
    verified: false,
  };
  await c.execute(
    `INSERT INTO NOM_RH_EVENTO (RHE_ENTIDAD,RHE_REGISTRO,EML_ID,RHE_ACCION,RHE_ACTOR,RHE_VERIFICADO,RHE_MOTIVO,RHE_EFECTIVA,RHE_ANTES,RHE_DESPUES) VALUES (:entity,TO_NUMBER(:id),TO_NUMBER(:employee),:action,:actor,:verified,:reason,TO_DATE(:effective,'YYYY-MM-DD'),:before,:after)`,
    {
      entity,
      id: String(id),
      employee: employee ? String(employee) : null,
      action,
      actor: String(actor.label).slice(0, 200),
      verified: actor.verified ? 1 : 0,
      reason: context.reason || null,
      effective: context.effective || null,
      before: { val: before ? JSON.stringify(before) : null, type: oracledb.CLOB },
      after: { val: after ? JSON.stringify(after) : null, type: oracledb.CLOB },
    },
  );
}
export async function history(c, query) {
  const binds = {},
    where = [];
  if (query.employee) {
    binds.employee = identifier(query.employee);
    where.push('EML_ID=TO_NUMBER(:employee)');
  } else {
    binds.entity = text(query.entity, 60);
    binds.id = identifier(query.id);
    where.push('RHE_ENTIDAD=:entity AND RHE_REGISTRO=TO_NUMBER(:id)');
  }
  const page = Math.max(1, Math.min(1000000, Number(query.page) || 1));
  const total = await run(
    c,
    `SELECT COUNT(*) AS "total" FROM NOM_RH_EVENTO WHERE ${where.join(' AND ')}`,
    binds,
  );
  const result = await c.execute(
    `SELECT RHE_ID,TO_CHAR(RHE_FECHA,'YYYY-MM-DD HH24:MI:SS') AS "at",RHE_ENTIDAD AS "entity",RHE_REGISTRO AS "record",RHE_ACCION AS "action",RHE_ACTOR AS "actor",RHE_VERIFICADO AS "verified",RHE_MOTIVO AS "reason",TO_CHAR(RHE_EFECTIVA,'YYYY-MM-DD') AS "effective",RHE_ANTES AS "before",RHE_DESPUES AS "after" FROM NOM_RH_EVENTO WHERE ${where.join(' AND ')} ORDER BY RHE_ID DESC OFFSET :offset ROWS FETCH NEXT 20 ROWS ONLY`,
    { ...binds, offset: (page - 1) * 20 },
    {
      ...executeOptions,
      fetchInfo: { before: { type: oracledb.STRING }, after: { type: oracledb.STRING } },
    },
  );
  return {
    rows: result.rows.map((r) => ({
      ...r,
      before: r.before ? JSON.parse(r.before) : null,
      after: r.after ? JSON.parse(r.after) : null,
    })),
    total: Number(total[0].total),
    page,
  };
}
// Parent row locks serialize edits, reconciliation and payments for the same payroll.
export async function lockPayroll(c, catalog, id) {
  return get(c, catalog, 'NOM_NOMINA', id, true);
}
export async function guardMutation(
  c,
  catalog,
  table,
  data,
  previous,
  context = {},
  removing = false,
) {
  const name = table.name;
  if (name === 'NOM_PERIODO' && previous?.NPE_ESTADO === 'ANULADO')
    fail('Un período anulado conserva su historial y no se puede editar.');
  if (name === 'NOM_EMPLEADO' && previous && data.EML_CODIGO !== previous.EML_CODIGO)
    fail('El código del empleado se asigna automáticamente y no se puede cambiar.', 'EML_CODIGO');
  if (
    name === 'NOM_INGRESO_VARIABLE' &&
    data.INV_ESTADO === 'PAGADA' &&
    previous?.INV_ESTADO !== 'PAGADA'
  )
    fail('El ingreso se marca pagado al cerrar la planilla que lo incluye.', 'INV_ESTADO');
  if (
    name === 'NOM_DESCUENTO_APLICADO' &&
    data.DAP_ESTADO === 'APLICADO' &&
    previous?.DAP_ESTADO !== 'APLICADO'
  )
    fail('El descuento se marca aplicado al cerrar la planilla que lo incluye.', 'DAP_ESTADO');
  if (name === 'NOM_NOMINA') {
    if (!previous && data.NOM_ESTADO !== 'BORRADOR')
      fail('Crea la planilla como BORRADOR. Después usa Revisar planilla.', 'NOM_ESTADO');
    if (previous && (previous.NOM_ESTADO !== 'BORRADOR' || data.NOM_ESTADO !== previous.NOM_ESTADO))
      fail(
        'Usa Revisar planilla para cambiar su estado. Las planillas cerradas no se editan.',
        'NOM_ESTADO',
      );
    if (!previous || data.NPE_ID !== previous.NPE_ID) {
      const p = await get(c, catalog, 'NOM_PERIODO', data.NPE_ID, true);
      if (p.NPE_ESTADO !== 'ABIERTO') fail('Selecciona un período abierto.', 'NPE_ID');
    }
    if (previous && (data.EMP_ID !== previous.EMP_ID || data.NPE_ID !== previous.NPE_ID)) {
      const rows = await run(
        c,
        'SELECT NOD_ID FROM NOM_NOMINA_DETALLE WHERE NOM_ID=TO_NUMBER(:id)',
        { id: previous.NOM_ID },
      );
      if (rows.length)
        fail('La planilla ya tiene empleados. Crea otra planilla para cambiar empresa o período.');
    }
  }
  if (
    name === 'NOM_PERIODO' &&
    previous &&
    ['NPE_TIPO', 'NPE_ANIO', 'NPE_MES', 'NPE_QUINCENA'].some((k) => data[k] !== previous[k])
  ) {
    for (const linked of catalog.values()) {
      if (!linked.fields.some((f) => f.ref?.table === 'NOM_PERIODO')) continue;
      const used = await run(
        c,
        `SELECT NPE_ID FROM ${linked.name} WHERE NPE_ID=TO_NUMBER(:id) FETCH FIRST 1 ROW ONLY`,
        { id: previous.NPE_ID },
      );
      if (used.length)
        fail(
          `El período tiene registros en ${linked.title || linked.name}. Su calendario se conserva; crea otro período para fechas distintas.`,
        );
    }
  }
  if (
    name === 'NOM_CUENTA_BANCARIA_EMPLEADO' &&
    previous &&
    (removing ||
      ['EML_ID', 'BAN_ID', 'CBE_NUMERO', 'CBE_TIPO'].some((k) => data[k] !== previous[k]))
  ) {
    const used = await run(
      c,
      "SELECT TRP_ID FROM NOM_TRANSFERENCIA_PAGO WHERE CBE_ID=TO_NUMBER(:id) AND TRP_ESTADO='CONFIRMADA' UNION ALL SELECT RPL_ID FROM NOM_RH_PAGO_LIQ WHERE CBE_ID=TO_NUMBER(:id) AND RPL_ESTADO='CONFIRMADA'",
      { id: previous.CBE_ID },
    );
    if (used.length)
      fail(
        'La cuenta tiene pagos confirmados. Registra otra cuenta para conservar los datos del pago.',
      );
  }
  if (
    name === 'NOM_PERIODO' &&
    (data.NPE_ESTADO !== 'ABIERTO' ||
      (previous?.NPE_ESTADO !== undefined && previous.NPE_ESTADO !== 'ABIERTO'))
  ) {
    if (!previous) fail('Crea el período ABIERTO y completa sus planillas antes de cerrarlo.');
    if (data.NPE_ESTADO !== previous.NPE_ESTADO) {
      const ns = await run(
        c,
        'SELECT NOM_ESTADO FROM NOM_NOMINA WHERE NPE_ID=TO_NUMBER(:id) FOR UPDATE',
        { id: previous.NPE_ID },
      );
      if (
        !ns.length ||
        ns.some((n) => !['PAGADA', 'ANULADA'].includes(n.NOM_ESTADO)) ||
        data.NPE_ESTADO !== 'CERRADO'
      )
        fail(
          'Solo se puede cerrar un período cuando todas sus planillas estén pagadas o anuladas.',
        );
    }
  }
  if (['NOM_NOMINA_DETALLE', 'NOM_NOMINA_CONCEPTO', 'NOM_TRANSFERENCIA_PAGO'].includes(name)) {
    const ids = new Set();
    for (const d of [previous, data].filter(Boolean)) {
      let id = d.NOM_ID;
      if (!id && d.NOD_ID) id = (await get(c, catalog, 'NOM_NOMINA_DETALLE', d.NOD_ID)).NOM_ID;
      if (id) ids.add(String(id));
    }
    for (const id of [...ids].sort()) {
      const n = await lockPayroll(c, catalog, id);
      if (
        name === 'NOM_TRANSFERENCIA_PAGO'
          ? !(n.NOM_ESTADO === 'CALCULADA' || (removing && n.NOM_ESTADO === 'BORRADOR'))
          : n.NOM_ESTADO !== 'BORRADOR'
      )
        fail(
          name === 'NOM_TRANSFERENCIA_PAGO'
            ? 'Registra pagos solo en una planilla CALCULADA.'
            : 'La planilla debe estar en BORRADOR para modificar su detalle o conceptos.',
        );
    }
  }
  if (name === 'NOM_NOMINA_DETALLE' && !removing) {
    if (
      money(data.NOD_INGRESOS).minus(money(data.NOD_DEDUCCIONES)).lt(0) ||
      !new Decimal(data.NOD_INGRESOS).minus(data.NOD_DEDUCCIONES).eq(data.NOD_LIQUIDO)
    )
      fail(
        'El líquido debe ser ingresos menos deducciones y no puede ser negativo.',
        'NOD_LIQUIDO',
      );
    const duplicates = await run(
      c,
      'SELECT NOD_ID FROM NOM_NOMINA_DETALLE WHERE NOM_ID=TO_NUMBER(:nom) AND RLA_ID=TO_NUMBER(:rel) AND NOD_ID<>TO_NUMBER(:id)',
      { nom: data.NOM_ID, rel: data.RLA_ID, id: previous?.NOD_ID || '0' },
    );
    if (duplicates.length) fail('La relación laboral ya está incluida en esta planilla.', 'RLA_ID');
  }
  if (name === 'NOM_NOMINA_CONCEPTO') {
    if (!removing) money(data.NDC_MONTO);
    if (previous) {
      const links = await run(c, 'SELECT NOM_ID FROM NOM_RH_REVISION WHERE NDC_ID=TO_NUMBER(:id)', {
        id: previous.NDC_ID,
      });
      if (links.length)
        fail(
          'Este concepto proviene de una novedad. Deshaz su revisión desde la planilla antes de editarlo.',
        );
    }
  }
  if (name === 'NOM_CONCEPTO') {
    if (!removing && !['INGRESO', 'DEDUCCION'].includes(data.NCO_TIPO))
      fail('Selecciona INGRESO o DEDUCCION.', 'NCO_TIPO');
    if (previous) {
      const liquidations = await run(
        c,
        "SELECT p.RPL_ID FROM NOM_LIQUIDACION_DETALLE d JOIN NOM_RH_PAGO_LIQ p ON p.LIL_ID=d.LIL_ID WHERE d.NCO_ID=TO_NUMBER(:id) AND p.RPL_ESTADO='CONFIRMADA'",
        { id: previous.NCO_ID },
      );
      if (liquidations.length)
        fail('El concepto tiene pagos de liquidación confirmados. Crea un concepto nuevo.');
      const locked = await run(
        c,
        "SELECT n.NOM_ID FROM NOM_NOMINA_CONCEPTO x JOIN NOM_NOMINA_DETALLE d ON d.NOD_ID=x.NOD_ID JOIN NOM_NOMINA n ON n.NOM_ID=d.NOM_ID WHERE x.NCO_ID=TO_NUMBER(:id) AND n.NOM_ESTADO<>'BORRADOR'",
        { id: previous.NCO_ID },
      );
      if (locked.length)
        fail(
          'El concepto se usa en una planilla cerrada. Crea otro concepto para conservar su historial.',
        );
    }
  }
  if (name === 'NOM_TRANSFERENCIA_PAGO') {
    if (previous?.TRP_ESTADO === 'CONFIRMADA')
      fail(
        'El pago confirmado se conserva. Solicita su corrección mediante el proceso contable antes de registrar otro.',
      );
    if (!removing) {
      await get(c, catalog, 'NOM_CUENTA_BANCARIA_EMPLEADO', data.CBE_ID, true);
      if (!paymentStates.includes(data.TRP_ESTADO))
        fail('Selecciona un estado de pago válido.', 'TRP_ESTADO');
      const detail = await get(c, catalog, 'NOM_NOMINA_DETALLE', data.NOD_ID);
      if (data.TRP_ESTADO === 'CONFIRMADA') {
        if (!data.TRP_REFERENCIA?.trim())
          fail('Ingresa la referencia del pago confirmado.', 'TRP_REFERENCIA');
        const duplicate = await run(
          c,
          "SELECT TRP_ID FROM NOM_TRANSFERENCIA_PAGO WHERE NOD_ID=TO_NUMBER(:id) AND TRP_REFERENCIA=:reference AND TRP_ESTADO='CONFIRMADA' AND TRP_ID<>TO_NUMBER(:self)",
          { id: data.NOD_ID, reference: data.TRP_REFERENCIA, self: previous?.TRP_ID || '0' },
        );
        if (duplicate.length)
          fail('Esta referencia ya tiene un pago confirmado para el empleado.', 'TRP_REFERENCIA');
        const [sum] = await run(
          c,
          'SELECT NVL(SUM(TRP_MONTO),0) AS "paid" FROM NOM_TRANSFERENCIA_PAGO WHERE NOD_ID=TO_NUMBER(:id) AND TRP_ESTADO=\'CONFIRMADA\' AND TRP_ID<>TO_NUMBER(:self)',
          { id: data.NOD_ID, self: previous?.TRP_ID || '0' },
        );
        if (new Decimal(sum.paid).plus(data.TRP_MONTO).gt(detail.NOD_LIQUIDO))
          fail('Los pagos confirmados exceden el líquido del empleado.', 'TRP_MONTO');
      }
    }
  }
  if (name === 'NOM_RELACION_LABORAL') {
    if (previous && data.EML_ID !== previous.EML_ID)
      fail(
        'La relación pertenece a este empleado. Crea otra relación para una persona distinta.',
        'EML_ID',
      );
    if (
      (!previous && data.RLA_ESTADO === 'FINALIZADA') ||
      (previous && previous.RLA_ESTADO !== data.RLA_ESTADO && data.RLA_ESTADO === 'FINALIZADA')
    )
      fail('Usa Registrar baja para revisar y finalizar esta relación laboral.', 'RLA_ESTADO');
    if (previous?.RLA_ESTADO === 'FINALIZADA')
      fail('La relación finalizada conserva su historial. Registra una nueva contratación.');
    if (data.RLA_FECHA_BAJA || data.RLA_MOTIVO_BAJA || data.MBA_ID)
      fail('Registra la fecha y el motivo mediante Registrar baja.');
  }
  if (name === 'NOM_EMPLEADO' && previous) {
    if (data.PER_ID !== previous.PER_ID)
      fail(
        'La persona del expediente no se puede sustituir. Edita sus datos personales o registra otro empleado.',
        'PER_ID',
      );
    if (data.EMP_ID !== previous.EMP_ID)
      fail(
        'No se puede cambiar la empresa de un expediente existente. Registra la contratación en la empresa de destino.',
        'EMP_ID',
      );
    if (String(data.EML_ACTIVO) === '0') {
      const rs = await run(
        c,
        "SELECT RLA_ID FROM NOM_RELACION_LABORAL WHERE EML_ID=TO_NUMBER(:id) AND RLA_ESTADO IN ('ACTIVA','SUSPENDIDA')",
        { id: previous.EML_ID },
      );
      if (rs.length)
        fail(
          'Registra la baja de las relaciones laborales antes de inactivar al empleado.',
          'EML_ACTIVO',
        );
    }
    if (
      ['EML_SALARIO_ORDINARIO_MENSUAL', 'EML_SALARIO_BONIFICACION_DECRETO'].some(
        (k) => !new Decimal(data[k]).eq(previous[k]),
      ) &&
      (!context.reason?.trim() || !context.effective)
    )
      fail('Para modificar la remuneración indica el motivo y la fecha efectiva.');
  }
  if (name === 'NOM_VACACION') {
    if (!previous && data.VAC_ESTADO !== 'SOLICITADA')
      fail('Registra la solicitud y usa Revisar vacaciones para aprobarla.', 'VAC_ESTADO');
    if (
      previous &&
      (data.VAC_ESTADO !== previous.VAC_ESTADO || previous.VAC_ESTADO !== 'SOLICITADA')
    )
      fail('Usa Revisar vacaciones para registrar una decisión.', 'VAC_ESTADO');
    await get(c, catalog, 'NOM_EMPLEADO', data.EML_ID, true);
    const conflicts = await vacationConflicts(c, data, previous?.VAC_ID || '0');
    if (conflicts.length)
      fail(
        'Ya existe una solicitud o ausencia que se cruza con estas fechas. Revisa el expediente.',
        'VAC_FECHA_INICIO',
      );
  }
  if (name === 'NOM_LIQUIDACION_LABORAL' || name === 'NOM_LIQUIDACION_DETALLE') {
    const ids = new Set(
      [
        name === 'NOM_LIQUIDACION_LABORAL' ? previous?.LIL_ID : data.LIL_ID,
        previous?.LIL_ID,
      ].filter(Boolean),
    );
    for (const id of [...ids].sort()) {
      await get(c, catalog, 'NOM_LIQUIDACION_LABORAL', id, true);
      const paid = await run(
        c,
        "SELECT RPL_ID FROM NOM_RH_PAGO_LIQ WHERE LIL_ID=TO_NUMBER(:id) AND RPL_ESTADO='CONFIRMADA'",
        { id },
      );
      if (paid.length) fail('La liquidación tiene pagos confirmados y no se puede modificar.');
    }
    if (name === 'NOM_LIQUIDACION_LABORAL' && !removing) {
      money(data.LIL_MONTO);
      if (!data.RLA_ID) fail('Selecciona la relación laboral de esta liquidación.', 'RLA_ID');
      const r = await get(c, catalog, 'NOM_RELACION_LABORAL', data.RLA_ID);
      if (r.EML_ID !== data.EML_ID || r.RLA_ESTADO !== 'FINALIZADA')
        fail(
          'La liquidación debe corresponder a una relación finalizada de este empleado.',
          'RLA_ID',
        );
    }
  }
  if (
    previous &&
    [
      'NOM_INGRESO_VARIABLE',
      'NOM_DESCUENTO_APLICADO',
      'NOM_MARCAJE',
      'NOM_MOVIMIENTO',
      'NOM_AUSENCIA',
      'NOM_VACACION',
      'NOM_PRESTAMO_CUOTA',
    ].includes(name)
  ) {
    const linked = await run(
      c,
      "SELECT n.NOM_ID FROM NOM_RH_REVISION r JOIN NOM_NOMINA n ON n.NOM_ID=r.NOM_ID WHERE r.RHR_FUENTE=:source AND r.RHR_REGISTRO=TO_NUMBER(:id) AND n.NOM_ESTADO NOT IN ('BORRADOR','ANULADA')",
      { source: name, id: String(previous[table.pk]) },
    );
    if (linked.length)
      fail('Este registro fue revisado en una planilla cerrada y conserva su historial.');
  }
}
function fingerprint(source) {
  return createHash('sha256').update(JSON.stringify(source)).digest('hex');
}
export async function payrollReview(c, catalog, id) {
  const payroll = await get(c, catalog, 'NOM_NOMINA', id),
    period = await get(c, catalog, 'NOM_PERIODO', payroll.NPE_ID);
  const details = await run(
    c,
    `SELECT d.*,e.EML_ID,e.EML_CODIGO,TRIM(p.PER_NOMBRES||' '||p.PER_APELLIDOS) AS "employee",(SELECT NVL(SUM(t.TRP_MONTO),0) FROM NOM_TRANSFERENCIA_PAGO t WHERE t.NOD_ID=d.NOD_ID AND t.TRP_ESTADO='CONFIRMADA') AS "paid" FROM NOM_NOMINA_DETALLE d JOIN NOM_RELACION_LABORAL r ON r.RLA_ID=d.RLA_ID JOIN NOM_EMPLEADO e ON e.EML_ID=r.EML_ID JOIN ERP_PERSONA p ON p.PER_ID=e.PER_ID WHERE d.NOM_ID=TO_NUMBER(:id) ORDER BY e.EML_CODIGO`,
    { id },
  );
  const concepts = await run(
    c,
    'SELECT x.NDC_ID,x.NOD_ID,x.NDC_MONTO,x.NCO_ID,n.NCO_TIPO,n.NCO_NOMBRE FROM NOM_NOMINA_CONCEPTO x JOIN NOM_CONCEPTO n ON n.NCO_ID=x.NCO_ID JOIN NOM_NOMINA_DETALLE d ON d.NOD_ID=x.NOD_ID WHERE d.NOM_ID=TO_NUMBER(:id) ORDER BY x.NDC_ID',
    { id },
  );
  const reviews = await run(c, 'SELECT * FROM NOM_RH_REVISION WHERE NOM_ID=TO_NUMBER(:id)', { id });
  const sources = [];
  const add = async (name, pk, sql, binds, amountField, kind) => {
    for (const r of await run(c, sql, binds))
      sources.push({
        key: `${name}:${r[pk]}`,
        table: name,
        id: r[pk],
        employeeId: r.EML_ID,
        relationId: r.RLA_ID,
        amount: amountField ? r[amountField] : null,
        kind,
        fields: r,
        fingerprint: fingerprint(r),
      });
  };
  const binds = { company: payroll.EMP_ID, period: payroll.NPE_ID };
  await add(
    'NOM_INGRESO_VARIABLE',
    'INV_ID',
    `SELECT i.*,r.EML_ID FROM NOM_INGRESO_VARIABLE i JOIN NOM_RELACION_LABORAL r ON r.RLA_ID=i.RLA_ID JOIN NOM_EMPLEADO e ON e.EML_ID=r.EML_ID WHERE e.EMP_ID=TO_NUMBER(:company) AND i.NPE_ID=TO_NUMBER(:period) AND i.INV_ESTADO<>'ANULADA' ORDER BY i.INV_ID`,
    binds,
    'INV_MONTO',
    'INGRESO',
  );
  await add(
    'NOM_DESCUENTO_APLICADO',
    'DAP_ID',
    `SELECT d.* FROM NOM_DESCUENTO_APLICADO d JOIN NOM_EMPLEADO e ON e.EML_ID=d.EML_ID WHERE e.EMP_ID=TO_NUMBER(:company) AND d.NPE_ID=TO_NUMBER(:period) AND d.DAP_ESTADO<>'ANULADO' ORDER BY d.DAP_ID`,
    binds,
    'DAP_MONTO',
    'DEDUCCION',
  );
  await add(
    'NOM_MARCAJE',
    'MRC_ID',
    `SELECT m.*,r.EML_ID FROM NOM_MARCAJE m JOIN NOM_RELACION_LABORAL r ON r.RLA_ID=m.RLA_ID JOIN NOM_EMPLEADO e ON e.EML_ID=r.EML_ID WHERE e.EMP_ID=TO_NUMBER(:company) AND m.NPE_ID=TO_NUMBER(:period) ORDER BY m.MRC_ID`,
    binds,
    null,
    'REVISION',
  );
  await add(
    'NOM_MOVIMIENTO',
    'NMO_ID',
    `SELECT m.* FROM NOM_MOVIMIENTO m JOIN NOM_EMPLEADO e ON e.EML_ID=m.EML_ID WHERE e.EMP_ID=TO_NUMBER(:company) AND m.NPE_ID=TO_NUMBER(:period) ORDER BY m.NMO_ID`,
    binds,
    null,
    'REVISION',
  );
  // Dated incidents are reviewed within the calendar interval represented by the period.
  const start = `${period.NPE_ANIO}-${String(period.NPE_MES).padStart(2, '0')}-${period.NPE_QUINCENA === '2' ? '16' : '01'}`;
  const end =
    period.NPE_QUINCENA === '1'
      ? start.slice(0, 8) + '15'
      : `${start.slice(0, 8)}${new Date(Date.UTC(Number(period.NPE_ANIO), Number(period.NPE_MES), 0)).getUTCDate()}`;
  const dated = { company: payroll.EMP_ID, dateStart: start, dateEnd: end };
  await add(
    'NOM_AUSENCIA',
    'AUS_ID',
    `SELECT a.* FROM NOM_AUSENCIA a JOIN NOM_EMPLEADO e ON e.EML_ID=a.EML_ID WHERE e.EMP_ID=TO_NUMBER(:company) AND a.AUS_FECHA_INICIO<=TO_DATE(:dateEnd,'YYYY-MM-DD') AND a.AUS_FECHA_FIN>=TO_DATE(:dateStart,'YYYY-MM-DD') ORDER BY a.AUS_ID`,
    dated,
    null,
    'REVISION',
  );
  await add(
    'NOM_VACACION',
    'VAC_ID',
    `SELECT v.* FROM NOM_VACACION v JOIN NOM_EMPLEADO e ON e.EML_ID=v.EML_ID WHERE e.EMP_ID=TO_NUMBER(:company) AND v.VAC_ESTADO<>'ANULADA' AND v.VAC_FECHA_INICIO<=TO_DATE(:dateEnd,'YYYY-MM-DD') AND v.VAC_FECHA_FIN>=TO_DATE(:dateStart,'YYYY-MM-DD') ORDER BY v.VAC_ID`,
    dated,
    null,
    'REVISION',
  );
  await add(
    'NOM_PRESTAMO_CUOTA',
    'NPC_ID',
    `SELECT q.*,p.EML_ID FROM NOM_PRESTAMO_CUOTA q JOIN NOM_PRESTAMO p ON p.NPR_ID=q.NPR_ID JOIN NOM_EMPLEADO e ON e.EML_ID=p.EML_ID WHERE e.EMP_ID=TO_NUMBER(:company) AND q.NPC_FECHA BETWEEN TO_DATE(:dateStart,'YYYY-MM-DD') AND TO_DATE(:dateEnd,'YYYY-MM-DD') ORDER BY q.NPC_ID`,
    dated,
    'NPC_MONTO',
    'DEDUCCION',
  );
  for (const source of sources) {
    source.review = reviews.find(
      (r) => r.RHR_FUENTE === source.table && r.RHR_REGISTRO === source.id,
    );
    source.current =
      !!source.review &&
      (payroll.NOM_ESTADO === 'PAGADA' || source.review.RHR_HUELLA === source.fingerprint);
    source.employee =
      details.find((d) => d.EML_ID === source.employeeId)?.employee ||
      `Empleado ${source.employeeId}`;
  }
  const reconciled = reconcile(details, concepts);
  return {
    payroll,
    period,
    start,
    end,
    details: reconciled,
    concepts,
    sources,
    pending: sources.filter((s) => !s.current).length,
    balanced:
      reconciled.length > 0 &&
      reconciled.every((d) => d.balanced && !new Decimal(d.calculatedNet).lt(0)),
    fullyPaid:
      reconciled.length > 0 && reconciled.every((d) => new Decimal(d.NOD_LIQUIDO).eq(d.paid)),
  };
}
export async function reviewSource(c, catalog, id, body, context) {
  const payroll = await lockPayroll(c, catalog, id);
  if (payroll.NOM_ESTADO !== 'BORRADOR') fail('La planilla debe estar en BORRADOR.');
  const review = await payrollReview(c, catalog, id),
    source = review.sources.find((s) => s.key === body.key);
  if (!source) fail('La novedad ya no está disponible. Actualiza la revisión.');
  if (body.decision === 'DESHACER') {
    if (!source.review) fail('Esta novedad aún no tiene revisión.');
    await c.execute(
      'DELETE FROM NOM_RH_REVISION WHERE NOM_ID=TO_NUMBER(:nom) AND RHR_FUENTE=:source AND RHR_REGISTRO=TO_NUMBER(:id)',
      { nom: id, source: source.table, id: source.id },
    );
    if (source.review.NDC_ID)
      await createRepository(catalog.get('NOM_NOMINA_CONCEPTO'), catalog).remove(
        c,
        source.review.NDC_ID,
      );
  } else {
    if (source.review) fail('Deshaz la revisión anterior antes de cambiarla.');
    if (!['INCLUIR', 'EXCLUIR', 'REVISADO'].includes(body.decision)) fail('Decisión no válida.');
    const reason = text(body.reason);
    let conceptId = null;
    if (body.decision === 'INCLUIR') {
      if (!source.amount || source.kind === 'REVISION')
        fail(
          'Esta novedad requiere revisión manual. Registra sus efectos en los conceptos y documenta la revisión.',
        );
      if (source.table === 'NOM_INGRESO_VARIABLE' && source.fields.INV_ESTADO !== 'APROBADA')
        fail('Aprueba primero el ingreso variable.');
      await get(c, catalog, source.table, source.id, true);
      const duplicate = await run(
        c,
        "SELECT r.NOM_ID FROM NOM_RH_REVISION r JOIN NOM_NOMINA n ON n.NOM_ID=r.NOM_ID WHERE r.RHR_FUENTE=:source AND r.RHR_REGISTRO=TO_NUMBER(:id) AND r.RHR_DECISION='INCLUIR' AND n.NOM_ESTADO<>'ANULADA'",
        { source: source.table, id: source.id },
      );
      if (duplicate.length) fail('Esta novedad ya fue incluida en otra planilla.');
      const fresh = (await payrollReview(c, catalog, id)).sources.find((s) => s.key === source.key);
      if (!fresh || fresh.fingerprint !== source.fingerprint)
        fail('La novedad cambió durante la revisión. Actualiza e inténtalo de nuevo.');
      const d = review.details.find((d) => d.NOD_ID === String(body.detailId));
      if (
        !d ||
        d.EML_ID !== source.employeeId ||
        (source.relationId && d.RLA_ID !== source.relationId)
      )
        fail('Selecciona el detalle del empleado y relación de la novedad.');
      const concept = await get(c, catalog, 'NOM_CONCEPTO', identifier(body.conceptId));
      if (concept.NCO_TIPO !== source.kind) fail(`Selecciona un concepto de tipo ${source.kind}.`);
      conceptId = await createRepository(catalog.get('NOM_NOMINA_CONCEPTO'), catalog).create(c, {
        NOD_ID: d.NOD_ID,
        NCO_ID: concept.NCO_ID,
        NDC_MONTO: source.amount,
      });
    } else if (body.decision === 'REVISADO' && source.kind !== 'REVISION')
      fail('Incluye o excluye expresamente esta novedad monetaria.');
    await c.execute(
      'INSERT INTO NOM_RH_REVISION (NOM_ID,RHR_FUENTE,RHR_REGISTRO,RHR_HUELLA,RHR_DECISION,RHR_MOTIVO,NDC_ID) VALUES (TO_NUMBER(:nom),:source,TO_NUMBER(:id),:hash,:decision,:reason,TO_NUMBER(:concept))',
      {
        nom: id,
        source: source.table,
        id: source.id,
        hash: source.fingerprint,
        decision: body.decision,
        reason,
        concept: conceptId,
      },
    );
  }
  await audit(
    c,
    catalog,
    'NOM_NOMINA',
    id,
    'REVISION_NOVEDAD',
    source.review,
    { key: source.key, decision: body.decision },
    { ...context, reason: body.reason || 'Revisión deshecha' },
  );
  return { ok: true };
}
export async function payrollAction(c, catalog, id, body, context) {
  const before = await lockPayroll(c, catalog, id),
    reason = text(body.reason);
  let review = await payrollReview(c, catalog, id);
  for (const source of [...review.sources].sort((a, b) => a.key.localeCompare(b.key)))
    await get(c, catalog, source.table, source.id, true);
  review = await payrollReview(c, catalog, id);
  const repo = createRepository(catalog.get('NOM_NOMINA'), catalog);
  if (body.action === 'CONCILIAR') {
    if (before.NOM_ESTADO !== 'BORRADOR') fail('Solo se concilia una planilla en BORRADOR.');
    if (
      !review.details.length ||
      review.details.some((d) => !d.conceptCount || new Decimal(d.calculatedNet).lt(0)) ||
      review.concepts.some((x) => !['INGRESO', 'DEDUCCION'].includes(x.NCO_TIPO))
    )
      fail('Agrega conceptos válidos a cada empleado. El líquido no puede ser negativo.');
    for (const d of review.details)
      await createRepository(catalog.get('NOM_NOMINA_DETALLE'), catalog).update(c, d.NOD_ID, {
        NOD_INGRESOS: d.calculatedIncome,
        NOD_DEDUCCIONES: d.calculatedDeductions,
        NOD_LIQUIDO: d.calculatedNet,
      });
  } else if (body.action === 'CALCULADA') {
    if (before.NOM_ESTADO !== 'BORRADOR' || !review.balanced || review.pending)
      fail('Revisa todas las novedades y concilia los conceptos antes de calcular la planilla.');
    await repo.update(c, id, { NOM_ESTADO: 'CALCULADA' });
  } else if (body.action === 'PAGADA') {
    if (
      before.NOM_ESTADO !== 'CALCULADA' ||
      !review.fullyPaid ||
      !review.balanced ||
      review.pending
    )
      fail(
        'Todos los empleados deben tener su líquido cubierto por pagos confirmados y la revisión vigente.',
      );
    await repo.update(c, id, { NOM_ESTADO: 'PAGADA' });
    for (const s of review.sources.filter((s) => s.review?.RHR_DECISION === 'INCLUIR')) {
      if (s.table === 'NOM_INGRESO_VARIABLE') {
        await c.execute(
          "UPDATE NOM_INGRESO_VARIABLE SET INV_ESTADO='PAGADA' WHERE INV_ID=TO_NUMBER(:id)",
          { id: s.id },
        );
        await audit(
          c,
          catalog,
          s.table,
          s.id,
          'PAGO_EN_PLANILLA',
          s.fields,
          { ...s.fields, INV_ESTADO: 'PAGADA' },
          { ...context, reason },
        );
      }
      if (s.table === 'NOM_DESCUENTO_APLICADO') {
        await c.execute(
          "UPDATE NOM_DESCUENTO_APLICADO SET DAP_ESTADO='APLICADO' WHERE DAP_ID=TO_NUMBER(:id)",
          { id: s.id },
        );
        await audit(
          c,
          catalog,
          s.table,
          s.id,
          'APLICADO_EN_PLANILLA',
          s.fields,
          { ...s.fields, DAP_ESTADO: 'APLICADO' },
          { ...context, reason },
        );
      }
    }
  } else if (body.action === 'BORRADOR' || body.action === 'ANULADA') {
    if (!['BORRADOR', 'CALCULADA'].includes(before.NOM_ESTADO))
      fail('Una planilla pagada o anulada conserva su historial.');
    const paid = review.details.some((d) => !new Decimal(d.paid).isZero());
    if (paid) fail('La planilla tiene pagos confirmados; no se puede reabrir ni anular.');
    await repo.update(c, id, { NOM_ESTADO: body.action });
  } else fail('Acción no válida.');
  await audit(
    c,
    catalog,
    'NOM_NOMINA',
    id,
    body.action,
    { payroll: before, details: review.details },
    { payroll: await repo.get(c, id), details: (await payrollReview(c, catalog, id)).details },
    { ...context, reason },
  );
  return { ok: true };
}
export async function vacationConflicts(c, v, id) {
  return run(
    c,
    `SELECT 'Vacaciones' AS "type",TO_CHAR(VAC_FECHA_INICIO,'YYYY-MM-DD') AS "start",TO_CHAR(VAC_FECHA_FIN,'YYYY-MM-DD') AS "end" FROM NOM_VACACION WHERE EML_ID=TO_NUMBER(:employee) AND VAC_ID<>TO_NUMBER(:id) AND VAC_ESTADO<>'ANULADA' AND VAC_FECHA_INICIO<=TO_DATE(:finish,'YYYY-MM-DD') AND VAC_FECHA_FIN>=TO_DATE(:dateStart,'YYYY-MM-DD') UNION ALL SELECT 'Ausencia',TO_CHAR(AUS_FECHA_INICIO,'YYYY-MM-DD'),TO_CHAR(AUS_FECHA_FIN,'YYYY-MM-DD') FROM NOM_AUSENCIA WHERE EML_ID=TO_NUMBER(:employee) AND NVL(AUS_ESTADO,'REGISTRADA') NOT IN ('ANULADA','ANULADO') AND AUS_FECHA_INICIO<=TO_DATE(:finish,'YYYY-MM-DD') AND AUS_FECHA_FIN>=TO_DATE(:dateStart,'YYYY-MM-DD')`,
    { employee: v.EML_ID, id, dateStart: v.VAC_FECHA_INICIO, finish: v.VAC_FECHA_FIN },
  );
}
export async function vacationReview(c, catalog, id) {
  const vacation = await get(c, catalog, 'NOM_VACACION', id),
    employee = await get(c, catalog, 'NOM_EMPLEADO', vacation.EML_ID);
  const validation = await vacationSnapshot(c, id);
  const calculation = await calculateVacation(c, vacation);
  const team = await run(
    c,
    `SELECT v.VAC_ID,TRIM(p.PER_NOMBRES||' '||p.PER_APELLIDOS) AS "employee",TO_CHAR(v.VAC_FECHA_INICIO,'YYYY-MM-DD') AS "start",TO_CHAR(v.VAC_FECHA_FIN,'YYYY-MM-DD') AS "end",v.VAC_ESTADO FROM NOM_VACACION v JOIN NOM_EMPLEADO e ON e.EML_ID=v.EML_ID JOIN ERP_PERSONA p ON p.PER_ID=e.PER_ID WHERE e.EMP_ID=TO_NUMBER(:company) AND v.EML_ID<>TO_NUMBER(:employee) AND v.VAC_ID<>TO_NUMBER(:id) AND v.VAC_ESTADO<>'ANULADA' AND v.VAC_FECHA_INICIO<=TO_DATE(:finish,'YYYY-MM-DD') AND v.VAC_FECHA_FIN>=TO_DATE(:dateStart,'YYYY-MM-DD') AND EXISTS (SELECT 1 FROM NOM_RELACION_LABORAL own JOIN NOM_RELACION_LABORAL coworker ON coworker.DPT_ID=own.DPT_ID WHERE own.EML_ID=TO_NUMBER(:employee) AND coworker.EML_ID=v.EML_ID AND GREATEST(own.RLA_FECHA_INGRESO,coworker.RLA_FECHA_INGRESO,v.VAC_FECHA_INICIO,TO_DATE(:dateStart,'YYYY-MM-DD'))<=LEAST(NVL(own.RLA_FECHA_BAJA,DATE '9999-12-31'),NVL(coworker.RLA_FECHA_BAJA,DATE '9999-12-31'),v.VAC_FECHA_FIN,TO_DATE(:finish,'YYYY-MM-DD'))) ORDER BY v.VAC_FECHA_INICIO`,
    {
      company: employee.EMP_ID,
      employee: vacation.EML_ID,
      id,
      dateStart: vacation.VAC_FECHA_INICIO,
      finish: vacation.VAC_FECHA_FIN,
    },
  );
  return {
    vacation,
    employee,
    calculation,
    validation,
    conflicts: await vacationConflicts(c, vacation, id),
    team,
  };
}
export async function vacationAction(c, catalog, id, body, context) {
  const before = await get(c, catalog, 'NOM_VACACION', id, true);
  await get(c, catalog, 'NOM_EMPLEADO', before.EML_ID, true);
  const reason = text(body.reason);
  const transitions = {
    SOLICITADA: ['APROBADA', 'ANULADA'],
    APROBADA: ['GOZADA', 'ANULADA'],
    GOZADA: [],
    ANULADA: [],
  };
  if (!transitions[before.VAC_ESTADO]?.includes(body.action))
    fail('Esta decisión no corresponde al estado actual. Actualiza la solicitud.');
  let savedCalculation;
  if (body.action === 'APROBADA') {
    const review = await vacationReview(c, catalog, id),
      calc = review.calculation;
    if (calc.errors.length) fail(calc.errors[0]);
    if (body.reviewToken !== calc.reviewToken)
      fail('El cálculo cambió o la revisión venció. Actualiza la revisión antes de aprobar.');
    if (calc.days <= 0)
      fail('El rango seleccionado no incluye días laborales de la jornada del empleado.');
    if (new Decimal(calc.balance).lt(calc.days))
      fail(
        `Saldo insuficiente: ${calc.balance} días disponibles para ${calc.days} días de vacaciones.`,
      );
    if (review.conflicts.length) fail('Resuelve los cruces de fechas antes de aprobar.');
    const source = `Automático: ${calc.months} meses completos × 1.25 días al ${calc.cutoff}; ${calc.committed} días previamente aprobados o gozados.`;
    savedCalculation = calc;
    await c.execute(
      'INSERT INTO NOM_RH_VACACION (VAC_ID,RHV_DIAS,RHV_SALDO,RHV_FUENTE,RHV_CALCULO) VALUES (TO_NUMBER(:id),TO_NUMBER(:days),TO_NUMBER(:balance),:source,:calculation)',
      {
        id,
        days: String(calc.days),
        balance: calc.balance,
        source,
        calculation: { val: JSON.stringify(calc), type: oracledb.CLOB },
      },
    );
  }
  if (body.action === 'GOZADA' && before.VAC_FECHA_FIN > new Date().toLocaleDateString('en-CA'))
    fail('Marca como gozadas después de la fecha final.');
  const after = { ...before, VAC_ESTADO: body.action };
  await createRepository(catalog.get('NOM_VACACION'), catalog).update(c, id, {
    VAC_ESTADO: body.action,
  });
  await audit(
    c,
    catalog,
    'NOM_VACACION',
    id,
    body.action,
    before,
    {
      ...after,
      validation: body.action === 'APROBADA' ? savedCalculation : undefined,
    },
    { ...context, reason },
  );
  return { ok: true };
}
export async function terminationReview(c, catalog, id) {
  const relation = await get(c, catalog, 'NOM_RELACION_LABORAL', id),
    employee = await get(c, catalog, 'NOM_EMPLEADO', relation.EML_ID);
  const loans = await run(
    c,
    'SELECT NPR_ID,NPR_MONTO,NPR_ESTADO FROM NOM_PRESTAMO WHERE EML_ID=TO_NUMBER(:id)',
    { id: employee.EML_ID },
  );
  const liquidations = await run(
    c,
    'SELECT LIL_ID,LIL_MONTO FROM NOM_LIQUIDACION_LABORAL WHERE RLA_ID=TO_NUMBER(:id)',
    { id },
  );
  return { relation, employee, loans, liquidations };
}
export async function terminate(c, catalog, id, body, context) {
  const before = await get(c, catalog, 'NOM_RELACION_LABORAL', id, true);
  if (before.RLA_ESTADO === 'FINALIZADA') fail('La baja ya fue registrada.');
  const employee = await get(c, catalog, 'NOM_EMPLEADO', before.EML_ID, true),
    reason = text(body.reason),
    end = date(body.date);
  if (end < before.RLA_FECHA_INGRESO) fail('La baja no puede ser anterior al ingreso.');
  if (body.reviewed !== true) fail('Confirma que revisaste los pendientes del empleado.');
  const after = {
    ...before,
    RLA_ESTADO: 'FINALIZADA',
    RLA_FECHA_BAJA: end,
    RLA_MOTIVO_BAJA: reason,
  };
  await createRepository(catalog.get('NOM_RELACION_LABORAL'), catalog).update(c, id, {
    RLA_ESTADO: 'FINALIZADA',
    RLA_FECHA_BAJA: end,
    RLA_MOTIVO_BAJA: reason,
  });
  const remaining = await run(
    c,
    "SELECT RLA_ID FROM NOM_RELACION_LABORAL WHERE EML_ID=TO_NUMBER(:id) AND RLA_ESTADO IN ('ACTIVA','SUSPENDIDA')",
    { id: before.EML_ID },
  );
  if (!remaining.length) {
    await createRepository(catalog.get('NOM_EMPLEADO'), catalog).update(c, before.EML_ID, {
      EML_ACTIVO: '0',
    });
    await audit(
      c,
      catalog,
      'NOM_EMPLEADO',
      before.EML_ID,
      'INACTIVAR_POR_BAJA',
      employee,
      { ...employee, EML_ACTIVO: '0' },
      { ...context, reason, effective: end },
    );
  }
  await audit(c, catalog, 'NOM_RELACION_LABORAL', id, 'BAJA', before, after, {
    ...context,
    reason,
    effective: end,
  });
  return { ok: true, employeeId: before.EML_ID, inactivated: !remaining.length };
}
export async function liquidationReview(c, catalog, id) {
  const liquidation = await get(c, catalog, 'NOM_LIQUIDACION_LABORAL', id);
  const details = await run(
    c,
    'SELECT d.LLD_ID,d.LLD_MONTO,n.NCO_NOMBRE,n.NCO_TIPO FROM NOM_LIQUIDACION_DETALLE d JOIN NOM_CONCEPTO n ON n.NCO_ID=d.NCO_ID WHERE d.LIL_ID=TO_NUMBER(:id) ORDER BY d.LLD_ID',
    { id },
  );
  const payments = await run(
    c,
    "SELECT RPL_ID,CBE_ID,TO_CHAR(RPL_FECHA,'YYYY-MM-DD') AS RPL_FECHA,RPL_MONTO,RPL_REFERENCIA,RPL_ESTADO FROM NOM_RH_PAGO_LIQ WHERE LIL_ID=TO_NUMBER(:id) ORDER BY RPL_ID",
    { id },
  );
  const sum = details.reduce(
    (v, d) => v.plus(d.NCO_TIPO === 'DEDUCCION' ? new Decimal(d.LLD_MONTO).negated() : d.LLD_MONTO),
    new Decimal(0),
  );
  const paid = payments
    .filter((p) => p.RPL_ESTADO === 'CONFIRMADA')
    .reduce((v, p) => v.plus(p.RPL_MONTO), new Decimal(0));
  return {
    liquidation,
    details,
    payments,
    total: sum.toFixed(2),
    paid: paid.toFixed(2),
    pending: new Decimal(liquidation.LIL_MONTO).minus(paid).toFixed(2),
    balanced:
      details.length > 0 &&
      details.every((d) => ['INGRESO', 'DEDUCCION'].includes(d.NCO_TIPO)) &&
      sum.eq(liquidation.LIL_MONTO),
  };
}
export async function payLiquidation(c, catalog, id, body, context) {
  const l = await get(c, catalog, 'NOM_LIQUIDACION_LABORAL', id, true),
    review = await liquidationReview(c, catalog, id);
  if (body.action === 'ANULAR') {
    const payment = review.payments.find((p) => p.RPL_ID === String(body.paymentId));
    if (!payment || payment.RPL_ESTADO === 'ANULADA') fail('Pago no disponible para anular.');
    const reason = text(body.reason);
    await c.execute("UPDATE NOM_RH_PAGO_LIQ SET RPL_ESTADO='ANULADA' WHERE RPL_ID=TO_NUMBER(:id)", {
      id: payment.RPL_ID,
    });
    await audit(
      c,
      catalog,
      'NOM_LIQUIDACION_LABORAL',
      id,
      'ANULAR_PAGO',
      payment,
      { ...payment, RPL_ESTADO: 'ANULADA', EML_ID: l.EML_ID },
      { ...context, reason },
    );
    return { ok: true };
  }
  if (body.action === 'ESTADO') {
    const payment = review.payments.find((p) => p.RPL_ID === String(body.paymentId));
    if (
      !payment ||
      !['PENDIENTE', 'RECHAZADA'].includes(payment.RPL_ESTADO) ||
      !['PENDIENTE', 'CONFIRMADA', 'RECHAZADA'].includes(body.state)
    )
      fail('Transición de pago no permitida.');
    const reference =
      body.state === 'CONFIRMADA'
        ? text(body.reference || payment.RPL_REFERENCIA, 200)
        : payment.RPL_REFERENCIA;
    if (
      body.state === 'CONFIRMADA' &&
      (!review.balanced || money(payment.RPL_MONTO).gt(review.pending))
    )
      fail('Revisa los conceptos y el saldo antes de confirmar este pago.');
    await c.execute(
      'UPDATE NOM_RH_PAGO_LIQ SET RPL_ESTADO=:state,RPL_REFERENCIA=:reference WHERE RPL_ID=TO_NUMBER(:id)',
      { state: body.state, reference, id: payment.RPL_ID },
    );
    await audit(
      c,
      catalog,
      'NOM_LIQUIDACION_LABORAL',
      id,
      'ESTADO_PAGO',
      payment,
      { ...payment, RPL_ESTADO: body.state, RPL_REFERENCIA: reference, EML_ID: l.EML_ID },
      context,
    );
    return { ok: true };
  }
  const state = body.state || 'CONFIRMADA';
  if (!paymentStates.includes(state)) fail('Selecciona un estado de pago permitido.');
  if (!review.balanced)
    fail('El monto de la liquidación debe coincidir con sus conceptos antes del pago.');
  const bank = await get(c, catalog, 'NOM_CUENTA_BANCARIA_EMPLEADO', identifier(body.bankId), true);
  if (bank.EML_ID !== l.EML_ID) fail('Selecciona una cuenta del empleado.');
  const amount = money(body.amount);
  if (amount.lte(0) || amount.gt(review.pending))
    fail('El pago debe ser positivo y no superar el saldo pendiente.');
  const reference =
      state === 'CONFIRMADA'
        ? text(body.reference, 200)
        : body.reference
          ? text(body.reference, 200)
          : null,
    when = date(body.date);
  await c.execute(
    "INSERT INTO NOM_RH_PAGO_LIQ (LIL_ID,CBE_ID,RPL_FECHA,RPL_MONTO,RPL_REFERENCIA,RPL_ESTADO) VALUES (TO_NUMBER(:id),TO_NUMBER(:bank),TO_DATE(:day,'YYYY-MM-DD'),TO_NUMBER(:amount),:reference,:state)",
    { id, bank: bank.CBE_ID, day: when, amount: amount.toFixed(2), reference, state },
  );
  await audit(
    c,
    catalog,
    'NOM_LIQUIDACION_LABORAL',
    id,
    'PAGO',
    null,
    {
      EML_ID: l.EML_ID,
      amount: amount.toFixed(2),
      reference,
      date: when,
      bank: bank.CBE_ID,
      state,
    },
    context,
  );
  return { ok: true };
}

export async function syncEmployment(c, catalog, table, row, context) {
  if (table.name !== 'NOM_RELACION_LABORAL' || row.RLA_ESTADO !== 'ACTIVA') return;
  const employee = await get(c, catalog, 'NOM_EMPLEADO', row.EML_ID, true);
  if (employee.EML_ACTIVO === '1') return;
  await createRepository(catalog.get('NOM_EMPLEADO'), catalog).update(c, employee.EML_ID, {
    EML_ACTIVO: '1',
  });
  await audit(
    c,
    catalog,
    'NOM_EMPLEADO',
    employee.EML_ID,
    'REACTIVAR_POR_CONTRATACION',
    employee,
    { ...employee, EML_ACTIVO: '1' },
    context,
  );
}
