import Decimal from 'decimal.js';
import { createHash } from 'node:crypto';
import oracledb from 'oracledb';
import { executeOptions } from '../config/pool.js';
import { serviceAccrual, scheduledVacationDays } from '../../../shared/vacations.js';
const rows = async (c, sql, binds = {}) => (await c.execute(sql, binds, executeOptions)).rows;
export async function vacationSnapshot(c, id) {
  const r = await c.execute(
    'SELECT RHV_DIAS AS "days",RHV_SALDO AS "balance",RHV_FUENTE AS "source",RHV_CALCULO AS "calculation" FROM NOM_RH_VACACION WHERE VAC_ID=TO_NUMBER(:id)',
    { id },
    { ...executeOptions, fetchInfo: { calculation: { type: oracledb.STRING } } },
  );
  const value = r.rows[0];
  return value
    ? { ...value, calculation: value.calculation ? JSON.parse(value.calculation) : null }
    : null;
}
export async function calculateVacation(c, vacation, { cutoff = vacation.VAC_FECHA_INICIO } = {}) {
  const relations = await rows(
    c,
    `SELECT r.RLA_ID AS "id",TO_CHAR(r.RLA_FECHA_INGRESO,'YYYY-MM-DD') AS "start",TO_CHAR(r.RLA_FECHA_BAJA,'YYYY-MM-DD') AS "end",r.DPT_ID AS "departmentId",d.DPT_NOMBRE AS "department" FROM NOM_RELACION_LABORAL r LEFT JOIN ERP_DEPARTAMENTO d ON d.DPT_ID=r.DPT_ID WHERE r.EML_ID=TO_NUMBER(:employee) ORDER BY r.RLA_FECHA_INGRESO,r.RLA_ID`,
    { employee: vacation.EML_ID },
  );
  const assignments = await rows(
    c,
    `SELECT a.RLJ_ID AS "id",a.RLA_ID AS "relationId",a.JOR_ID AS "scheduleId",j.JOR_NOMBRE AS "name",TO_CHAR(a.RLJ_FECHA_DESDE,'YYYY-MM-DD') AS "start",TO_CHAR(a.RLJ_FECHA_HASTA,'YYYY-MM-DD') AS "end",CASE WHEN j.EMP_ID=e.EMP_ID THEN 1 ELSE 0 END AS "sameCompany" FROM NOM_RELACION_JORNADA a JOIN NOM_RELACION_LABORAL r ON r.RLA_ID=a.RLA_ID JOIN NOM_EMPLEADO e ON e.EML_ID=r.EML_ID JOIN NOM_JORNADA j ON j.JOR_ID=a.JOR_ID WHERE r.EML_ID=TO_NUMBER(:employee) ORDER BY a.RLJ_ID`,
    { employee: vacation.EML_ID },
  );
  const details = await rows(
    c,
    `SELECT d.JOR_ID,d.JOD_DIA_SEMANA,d.JOD_MINUTOS_ORDINARIOS,d.JOD_HORA_ENTRADA,d.JOD_HORA_SALIDA FROM NOM_JORNADA_DETALLE d WHERE EXISTS(SELECT 1 FROM NOM_RELACION_JORNADA a JOIN NOM_RELACION_LABORAL r ON r.RLA_ID=a.RLA_ID WHERE a.JOR_ID=d.JOR_ID AND r.EML_ID=TO_NUMBER(:employee)) ORDER BY d.JOR_ID,d.JOD_DIA_SEMANA`,
    { employee: vacation.EML_ID },
  );
  const schedules = assignments.map((a) => {
    const ds = details.filter((d) => d.JOR_ID === a.scheduleId);
    const weekdays = ds
      .filter(
        (d) =>
          Number(d.JOD_MINUTOS_ORDINARIOS) > 0 ||
          (d.JOD_HORA_ENTRADA && d.JOD_HORA_SALIDA && d.JOD_HORA_ENTRADA !== d.JOD_HORA_SALIDA),
      )
      .map((d) => Number(d.JOD_DIA_SEMANA));
    const incomplete = ds.some(
      (d) => Number(d.JOD_MINUTOS_ORDINARIOS) === 0 && !!d.JOD_HORA_ENTRADA !== !!d.JOD_HORA_SALIDA,
    );
    return { ...a, weekdays, invalid: a.sameCompany !== '1' || incomplete };
  });
  const scheduled = scheduledVacationDays(
    vacation.VAC_FECHA_INICIO,
    vacation.VAC_FECHA_FIN,
    relations,
    schedules,
  );
  const accrual = serviceAccrual(relations, cutoff);
  const prior = await rows(
    c,
    `SELECT v.VAC_ID AS "id",v.VAC_ESTADO AS "state",TO_CHAR(v.VAC_FECHA_INICIO,'YYYY-MM-DD') AS "start",TO_CHAR(v.VAC_FECHA_FIN,'YYYY-MM-DD') AS "end",x.RHV_DIAS AS "savedDays" FROM NOM_VACACION v LEFT JOIN NOM_RH_VACACION x ON x.VAC_ID=v.VAC_ID WHERE v.EML_ID=TO_NUMBER(:employee) AND v.VAC_ID<>TO_NUMBER(:id) AND v.VAC_ESTADO IN ('APROBADA','GOZADA') ORDER BY v.VAC_FECHA_INICIO,v.VAC_ID`,
    { employee: vacation.EML_ID, id: vacation.VAC_ID },
  );
  const errors = [...scheduled.errors];
  if (!relations.length)
    errors.push('Registra la contratación y su fecha de ingreso para calcular el saldo.');
  let committed = new Decimal(0);
  const deductions = prior.map((p) => {
    let days = p.savedDays;
    if (days === null) {
      const historical = scheduledVacationDays(p.start, p.end, relations, schedules);
      if (historical.errors.length) {
        errors.push(`No se puede calcular la solicitud previa ${p.id}: ${historical.errors[0]}`);
        days = null;
      } else days = String(historical.days);
    }
    if (days !== null) committed = committed.plus(days);
    return {
      id: p.id,
      state: p.state,
      start: p.start,
      end: p.end,
      days,
      source: p.savedDays === null ? 'Jornada histórica' : 'Días registrados al aprobar',
    };
  });
  const balance = new Decimal(accrual.accrued).minus(committed);
  const calculation = {
    ...accrual,
    ...scheduled,
    errors: [...new Set(errors)],
    committed: committed.toFixed(2),
    balance: errors.length ? null : balance.toFixed(2),
    remaining: errors.length ? null : balance.minus(scheduled.days).toFixed(2),
    deductions,
    departments: [
      ...new Set(
        relations
          .filter(
            (r) =>
              r.start <= vacation.VAC_FECHA_FIN && (!r.end || r.end >= vacation.VAC_FECHA_INICIO),
          )
          .map((r) => r.department)
          .filter(Boolean),
      ),
    ],
    start: vacation.VAC_FECHA_INICIO,
    end: vacation.VAC_FECHA_FIN,
    dayCountReady: scheduled.errors.length === 0,
    version: 1,
  };
  return {
    ...calculation,
    reviewToken: createHash('sha256').update(JSON.stringify(calculation)).digest('hex'),
  };
}
