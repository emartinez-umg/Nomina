import { checklist } from './checklist.js';
import { ApiError, createRepository } from '../repositories/repository.js';
import { executeOptions } from '../config/pool.js';
import { payload, identifier } from '../validators/payload.js';
const invalid = (field, message) => {
  throw new ApiError(422, message, { [field]: message });
};
export async function validateRelations(c, table, data, catalog) {
  const get = async (name, id) => createRepository(catalog.get(name), catalog).get(c, String(id));
  if (table.fields.some((f) => f.ref?.table === 'NOM_PERIODO') && data.NPE_ID) {
    const period = await createRepository(catalog.get('NOM_PERIODO'), catalog).get(
      c,
      String(data.NPE_ID),
      true,
    );
    if (period.NPE_ESTADO === 'ANULADO')
      invalid('NPE_ID', 'El período está anulado. Selecciona otro período.');
  }
  if (table.name === 'ERP_PERSONA_DOCUMENTO' && data.TDI_ID) {
    const type = await get('ERP_TIPO_DOCUMENTO_IDENTIDAD', data.TDI_ID);
    if (/DPI|DOCUMENTO PERSONAL/i.test(type.TDI_NOMBRE) && !/^\d{13}$/.test(data.PDC_NUMERO || ''))
      invalid('PDC_NUMERO', 'El DPI debe contener exactamente 13 dígitos, sin espacios.');
  }
  if (table.name === 'NOM_EMPLEADO') {
    const p = await get('ERP_PERSONA', data.PER_ID);
    if (p.PER_TIPO !== 'F') invalid('PER_ID', 'Selecciona una persona física para el empleado.');
  }
  if (table.name === 'NOM_RELACION_LABORAL') {
    const e = await get('NOM_EMPLEADO', data.EML_ID),
      s = await get('ERP_SUCURSAL', data.SUC_ID);
    if (e.EMP_ID !== s.EMP_ID)
      invalid('SUC_ID', 'La sucursal debe pertenecer a la empresa del empleado.');
    if (data.DPT_ID) {
      const d = await get('ERP_DEPARTAMENTO', data.DPT_ID);
      if (e.EMP_ID !== d.EMP_ID)
        invalid('DPT_ID', 'El departamento debe pertenecer a la empresa del empleado.');
    }
  }
  if (table.name === 'NOM_NOMINA_DETALLE') {
    const n = await get('NOM_NOMINA', data.NOM_ID),
      r = await get('NOM_RELACION_LABORAL', data.RLA_ID),
      e = await get('NOM_EMPLEADO', r.EML_ID);
    if (n.EMP_ID !== e.EMP_ID)
      invalid('RLA_ID', 'La relación laboral debe pertenecer a la empresa de la planilla.');
  }
  if (table.name === 'NOM_TRANSFERENCIA_PAGO') {
    const n = await get('NOM_NOMINA_DETALLE', data.NOD_ID),
      r = await get('NOM_RELACION_LABORAL', n.RLA_ID),
      bank = await get('NOM_CUENTA_BANCARIA_EMPLEADO', data.CBE_ID);
    if (r.EML_ID !== bank.EML_ID)
      invalid('CBE_ID', 'La cuenta bancaria debe pertenecer al empleado que recibe el pago.');
  }
  if (table.name === 'NOM_AUSENCIA' && data.AUS_FECHA_FIN < data.AUS_FECHA_INICIO)
    invalid('AUS_FECHA_FIN', 'La fecha final debe ser igual o posterior a la inicial.');
}
// One transaction is committed by the router only after every record has succeeded.
export async function hire(c, body, catalog) {
  if (!body || typeof body !== 'object' || Array.isArray(body))
    throw new ApiError(400, 'Envía los datos del alta.');
  const create = async (name, input) => {
    const table = catalog.get(name),
      data = payload(table, input, { create: true });
    await validateRelations(c, table, data, catalog);
    const repo = createRepository(table, catalog);
    return repo.get(c, await repo.create(c, data));
  };
  payload(
    catalog.get('NOM_EMPLEADO'),
    { ...body.employee, PER_ID: body.personId || '1', EML_ACTIVO: '1' },
    { create: true },
  );
  let person;
  if (body.personId) {
    if (body.person)
      throw new ApiError(422, 'Selecciona una persona existente o registra una nueva.');
    person = await createRepository(catalog.get('ERP_PERSONA'), catalog).get(
      c,
      identifier(body.personId),
      true,
    );
  } else person = await create('ERP_PERSONA', body.person);
  if (person.PER_TIPO !== 'F')
    invalid('PER_TIPO', 'El alta de empleados requiere una persona física.');
  if (person.PER_ACTIVO !== '1') invalid('PER_ID', 'Activa la persona antes de contratarla.');
  const duplicate = await c.execute(
    'SELECT EML_ID FROM NOM_EMPLEADO WHERE PER_ID=TO_NUMBER(:person) AND EMP_ID=TO_NUMBER(:company)',
    { person: person.PER_ID, company: String(body.employee?.EMP_ID || '0') },
    executeOptions,
  );
  if (duplicate.rows.length)
    throw new ApiError(
      409,
      'Esta persona ya tiene un empleado en la empresa. Abre su expediente para agregar una relación laboral.',
    );
  if (body.email)
    await create('ERP_PERSONA_CORREO', {
      PER_ID: person.PER_ID,
      PCO_CORREO: body.email,
      PCO_PRINCIPAL: '1',
    });
  if (body.phone)
    await create('ERP_PERSONA_TELEFONO', {
      PER_ID: person.PER_ID,
      PTE_NUMERO: body.phone,
      PTE_TIPO: 'PERSONAL',
      PTE_PRINCIPAL: '1',
    });
  const employee = await create('NOM_EMPLEADO', {
    ...body.employee,
    PER_ID: person.PER_ID,
    EML_ACTIVO: '1',
  });
  const relation = await create('NOM_RELACION_LABORAL', {
    ...body.relation,
    EML_ID: employee.EML_ID,
    RLA_ESTADO: 'ACTIVA',
  });
  return { person, employee, relation };
}
export async function dashboard(c, query) {
  const company = query.company ? identifier(query.company) : null;
  const binds = company ? { company } : {};
  const scope = (alias) => (company ? `${alias}.EMP_ID=TO_NUMBER(:company)` : '1=1');
  const rows = async (sql, b = binds) => (await c.execute(sql, b, executeOptions)).rows;
  // Counts are separate from payroll joins so multiple contracts cannot multiply salary totals.
  const [staff] = await rows(
    `SELECT COUNT(*) AS "total", COUNT(CASE WHEN e.EML_ACTIVO=1 THEN 1 END) AS "active", NVL(SUM(CASE WHEN e.EML_ACTIVO=1 THEN e.EML_SALARIO_ORDINARIO_MENSUAL+e.EML_SALARIO_BONIFICACION_DECRETO ELSE 0 END),0) AS "monthlySalary", COUNT(CASE WHEN e.EML_ACTIVO=1 AND NOT EXISTS(SELECT 1 FROM NOM_RELACION_LABORAL r WHERE r.EML_ID=e.EML_ID AND r.RLA_ESTADO='ACTIVA') THEN 1 END) AS "withoutContract", COUNT(CASE WHEN e.EML_ACTIVO=1 AND NOT EXISTS(SELECT 1 FROM NOM_CUENTA_BANCARIA_EMPLEADO b WHERE b.EML_ID=e.EML_ID) THEN 1 END) AS "withoutBank" FROM NOM_EMPLEADO e WHERE ${scope('e')}`,
  );
  const [vacations] = await rows(
    `SELECT COUNT(*) AS "pending" FROM NOM_VACACION v JOIN NOM_EMPLEADO e ON e.EML_ID=v.EML_ID WHERE v.VAC_ESTADO='SOLICITADA' AND ${scope('e')}`,
  );
  const [income] = await rows(
    `SELECT COUNT(*) AS "pending",NVL(SUM(i.INV_MONTO),0) AS "amount" FROM NOM_INGRESO_VARIABLE i JOIN NOM_RELACION_LABORAL r ON r.RLA_ID=i.RLA_ID JOIN NOM_EMPLEADO e ON e.EML_ID=r.EML_ID WHERE i.INV_ESTADO='PENDIENTE' AND ${scope('e')}`,
  );
  const [discounts] = await rows(
    `SELECT COUNT(*) AS "pending",NVL(SUM(d.DAP_MONTO),0) AS "amount" FROM NOM_DESCUENTO_APLICADO d JOIN NOM_EMPLEADO e ON e.EML_ID=d.EML_ID WHERE d.DAP_ESTADO='PENDIENTE' AND ${scope('e')}`,
  );
  const payroll = await rows(
    `SELECT n.NOM_ID,n.NOM_ESTADO,n.EMP_ID,e.EMP_RAZON_SOCIAL,p.NPE_ANIO,p.NPE_MES,p.NPE_QUINCENA,p.NPE_TIPO,COUNT(d.NOD_ID) AS "employees",NVL(SUM(d.NOD_INGRESOS),0) AS "income",NVL(SUM(d.NOD_DEDUCCIONES),0) AS "deductions",NVL(SUM(d.NOD_LIQUIDO),0) AS "net" FROM NOM_NOMINA n JOIN ERP_EMPRESA e ON e.EMP_ID=n.EMP_ID JOIN NOM_PERIODO p ON p.NPE_ID=n.NPE_ID LEFT JOIN NOM_NOMINA_DETALLE d ON d.NOM_ID=n.NOM_ID WHERE ${scope('n')} GROUP BY n.NOM_ID,n.NOM_ESTADO,n.EMP_ID,e.EMP_RAZON_SOCIAL,p.NPE_ANIO,p.NPE_MES,p.NPE_QUINCENA,p.NPE_TIPO ORDER BY p.NPE_ANIO DESC,p.NPE_MES DESC,p.NPE_QUINCENA DESC,n.NOM_ID DESC FETCH FIRST 6 ROWS ONLY`,
  );
  const departments = await rows(
    `SELECT NVL(d.DPT_NOMBRE,'Sin departamento') AS "name",COUNT(DISTINCT e.EML_ID) AS "count" FROM NOM_RELACION_LABORAL r JOIN NOM_EMPLEADO e ON e.EML_ID=r.EML_ID LEFT JOIN ERP_DEPARTAMENTO d ON d.DPT_ID=r.DPT_ID WHERE e.EML_ACTIVO=1 AND r.RLA_ESTADO='ACTIVA' AND ${scope('e')} GROUP BY d.DPT_NOMBRE ORDER BY COUNT(DISTINCT e.EML_ID) DESC FETCH FIRST 8 ROWS ONLY`,
  );
  const missing = checklist(),
    missingClause = Object.values(missing)
      .map((s) => '(' + s + ')')
      .join(' OR ');
  const attention = await rows(
    `SELECT e.EML_ID,e.EML_CODIGO,TRIM(p.PER_NOMBRES||' '||p.PER_APELLIDOS) AS "name",${Object.entries(
      missing,
    )
      .map(([k, v]) => `CASE WHEN ${v} THEN 1 ELSE 0 END AS "${k}"`)
      .join(
        ',',
      )} FROM NOM_EMPLEADO e JOIN ERP_PERSONA p ON p.PER_ID=e.PER_ID WHERE e.EML_ACTIVO=1 AND ${scope('e')} AND (${missingClause}) ORDER BY e.EML_ID DESC FETCH FIRST 10 ROWS ONLY`,
  );
  const [attentionCount] = await rows(
    `SELECT COUNT(*) AS "total" FROM NOM_EMPLEADO e WHERE e.EML_ACTIVO=1 AND ${scope('e')} AND (${missingClause})`,
  );
  const periods = await rows(
    `SELECT NPE_ID,NPE_ANIO,NPE_MES,NPE_TIPO,NPE_QUINCENA FROM NOM_PERIODO WHERE NPE_ESTADO='ABIERTO' ORDER BY NPE_ANIO DESC,NPE_MES DESC`,
    {},
  );
  return {
    staff,
    vacations,
    income,
    discounts,
    payroll,
    departments,
    attention,
    attentionTotal: Number(attentionCount.total),
    periods,
    updatedAt: new Date().toISOString(),
  };
}
