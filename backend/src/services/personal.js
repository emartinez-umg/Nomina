import { Router } from 'express';
import { ApiError } from '../repositories/repository.js';
import { executeOptions } from '../config/pool.js';
import { roles, requireRole } from './access.js';
import { validDate } from '../../../shared/validation.js';
import { validPhone } from '../../../shared/field-help.js';
import { businessRules } from '../../../shared/business-rules.js';
import { audit, changeContext } from './workflow.js';
const run = async (c, sql, binds = {}) => (await c.execute(sql, binds, executeOptions)).rows;
export function personalRouter(connection, catalog) {
  const router = Router();
  router.use((req, _res, next) => {
    if (!req.nominaActor?.role)
      throw new ApiError(401, 'Inicia sesión para consultar esta sección.');
    next();
  });
  router.get('/siguiente-periodo', async (req, res) => {
    requireRole(req.nominaActor, [roles.SYSTEM, roles.PAYROLL]);
    const type = String(req.query.type || '').trim();
    if (!type || type.length > 20) throw new ApiError(422, 'Indica el tipo de período.');
    const fortnight = req.query.fortnight === '1';
    const latest = await connection(
      async (c) =>
        (
          await run(
            c,
            "SELECT NPE_ANIO,NPE_MES,NPE_QUINCENA FROM NOM_PERIODO WHERE NPE_TIPO=:type AND NPE_ESTADO<>'ANULADO' AND " +
              (fortnight ? 'NPE_QUINCENA IS NOT NULL' : 'NPE_QUINCENA IS NULL') +
              ' ORDER BY NPE_ANIO DESC,NPE_MES DESC,NPE_QUINCENA DESC FETCH FIRST 1 ROW ONLY',
            { type },
          )
        )[0],
    );
    const today = new Date();
    let year = latest ? Number(latest.NPE_ANIO) : today.getFullYear();
    let month = latest ? Number(latest.NPE_MES) : today.getMonth() + 1;
    let half = fortnight ? (latest ? Number(latest.NPE_QUINCENA) : 1) : null;
    if (latest) {
      if (fortnight && half === 1) half = 2;
      else {
        month++;
        if (fortnight) half = 1;
      }
      if (month === 13) {
        month = 1;
        year++;
      }
    }
    res.json({
      NPE_ANIO: String(year),
      NPE_MES: String(month),
      NPE_QUINCENA: half ? String(half) : '',
    });
  });
  router.get('/mi-informacion', async (req, res) =>
    res.json(
      await connection(async (c) => {
        const actor = req.nominaActor;
        const employees = await run(
          c,
          'SELECT e.EML_ID,e.EML_CODIGO,e.EML_SALARIO_ORDINARIO_MENSUAL,e.EML_SALARIO_BONIFICACION_DECRETO,p.PER_NOMBRES,p.PER_APELLIDOS FROM NOM_EMPLEADO e JOIN ERP_PERSONA p ON p.PER_ID=e.PER_ID WHERE e.PER_ID=TO_NUMBER(:person) AND e.EMP_ID=TO_NUMBER(:company)',
          { person: actor.personId, company: actor.companyId },
        );
        const slips = await run(
          c,
          "SELECT d.NOD_ID,d.NOD_INGRESOS,d.NOD_DEDUCCIONES,d.NOD_LIQUIDO,p.NPE_ANIO,p.NPE_MES,p.NPE_QUINCENA,n.NOM_ESTADO FROM NOM_NOMINA_DETALLE d JOIN NOM_NOMINA n ON n.NOM_ID=d.NOM_ID JOIN NOM_PERIODO p ON p.NPE_ID=n.NPE_ID JOIN NOM_RELACION_LABORAL r ON r.RLA_ID=d.RLA_ID JOIN NOM_EMPLEADO e ON e.EML_ID=r.EML_ID WHERE e.PER_ID=TO_NUMBER(:person) AND e.EMP_ID=TO_NUMBER(:company) AND n.NOM_ESTADO IN ('CALCULADA','PAGADA') ORDER BY p.NPE_ANIO DESC,p.NPE_MES DESC,p.NPE_QUINCENA DESC",
          { person: actor.personId, company: actor.companyId },
        );
        return { employees, slips };
      }),
    ),
  );
  router.get('/calendario', async (req, res) =>
    res.json(
      await connection(async (c) => {
        const actor = req.nominaActor,
          from = String(req.query.from || ''),
          to = String(req.query.to || '');
        if (
          !validDate(from) ||
          !validDate(to) ||
          from > to ||
          Date.parse(to) - Date.parse(from) > 93 * 86400000
        )
          throw new ApiError(422, 'Selecciona un intervalo válido de hasta tres meses.');
        const binds = { dateFrom: from, dateTo: to, company: actor.companyId };
        let scope = 'e.EMP_ID=TO_NUMBER(:company)';
        if (actor.role === roles.EMPLOYEE) {
          scope += ' AND e.PER_ID=TO_NUMBER(:person)';
          binds.person = actor.personId;
        }
        if (req.query.department) {
          if (!/^\d{1,38}$/.test(req.query.department))
            throw new ApiError(422, 'Departamento no válido.');
          scope +=
            ' AND EXISTS(SELECT 1 FROM NOM_RELACION_LABORAL dr WHERE dr.EML_ID=e.EML_ID AND dr.DPT_ID=TO_NUMBER(:department))';
          binds.department = req.query.department;
        }
        const events = [];
        for (const [table, prefix, type, slug] of [
          ['NOM_VACACION', 'VAC', 'Vacaciones', 'vacacion'],
          ['NOM_AUSENCIA', 'AUS', 'Ausencia', 'ausencia'],
        ]) {
          const rows = await run(
            c,
            `SELECT x.${prefix}_ID AS "id",TO_CHAR(x.${prefix}_FECHA_INICIO,'YYYY-MM-DD') AS "start",TO_CHAR(x.${prefix}_FECHA_FIN,'YYYY-MM-DD') AS "end",x.${prefix}_ESTADO AS "state",TRIM(p.PER_NOMBRES||' '||p.PER_APELLIDOS) AS "name" FROM ${table} x JOIN NOM_EMPLEADO e ON e.EML_ID=x.EML_ID JOIN ERP_PERSONA p ON p.PER_ID=e.PER_ID WHERE ${scope} AND x.${prefix}_FECHA_INICIO<=TO_DATE(:dateTo,'YYYY-MM-DD') AND x.${prefix}_FECHA_FIN>=TO_DATE(:dateFrom,'YYYY-MM-DD') AND x.${prefix}_ESTADO<>'ANULADA'`,
            binds,
          );
          events.push(...rows.map((r) => ({ ...r, type, slug, key: slug + ':' + r.id })));
        }
        const holidays = await run(
          c,
          'SELECT NAS_ID AS "id",NAS_NOMBRE AS "name",TO_CHAR(NAS_FECHA,\'YYYY-MM-DD\') AS "start" FROM NOM_ASUETO WHERE NAS_EMPRESA=TO_NUMBER(:company) AND NAS_FECHA BETWEEN TO_DATE(:dateFrom,\'YYYY-MM-DD\') AND TO_DATE(:dateTo,\'YYYY-MM-DD\')',
          { company: actor.companyId, dateFrom: from, dateTo: to },
        );
        events.push(
          ...holidays.map((r) => ({ ...r, end: r.start, type: 'Asueto', key: 'asueto:' + r.id })),
        );
        // Pay and cutoff dates come from each configured period; canceled periods are excluded.
        const periods = await run(
          c,
          "SELECT NPE_ID,NPE_ANIO,NPE_MES,NPE_QUINCENA,NPE_ESTADO FROM NOM_PERIODO WHERE NPE_ESTADO<>'ANULADO' AND NPE_ANIO BETWEEN :firstYear AND :lastYear",
          { firstYear: Number(from.slice(0, 4)), lastYear: Number(to.slice(0, 4)) },
        );
        for (const p of periods) {
          const end =
            Number(p.NPE_QUINCENA) === 1
              ? 15
              : new Date(Number(p.NPE_ANIO), Number(p.NPE_MES), 0).getDate();
          const day = `${p.NPE_ANIO}-${String(p.NPE_MES).padStart(2, '0')}-${String(end).padStart(2, '0')}`;
          if (day >= from && day <= to)
            events.push({
              key: 'pago:' + p.NPE_ID,
              id: p.NPE_ID,
              start: day,
              end: day,
              type: 'Pago y cierre',
              name: 'Fecha programada de pago y corte',
              state: p.NPE_ESTADO,
              slug: 'periodo',
            });
        }
        return events.sort((a, b) => a.start.localeCompare(b.start));
      }),
    ),
  );
  router.post('/asuetos', async (req, res) => {
    requireRole(req.nominaActor, [roles.SYSTEM]);
    const name = String(req.body?.name || '').trim(),
      date = req.body?.date;
    if (!name || name.length > 150 || !validDate(date))
      throw new ApiError(422, 'Completa el nombre del asueto y una fecha válida.');
    await connection(
      async (c) => {
        await c.execute(
          "INSERT INTO NOM_ASUETO(NAS_EMPRESA,NAS_FECHA,NAS_NOMBRE) VALUES(TO_NUMBER(:company),TO_DATE(:holidayDate,'YYYY-MM-DD'),:name)",
          { company: req.nominaActor.companyId, holidayDate: date, name },
        );
      },
      { write: true },
    );
    res.status(201).json({ name, date });
  });
  router.get('/avisos', async (req, res) => {
    requireRole(req.nominaActor, [roles.SYSTEM, roles.PAYROLL]);
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Guatemala' });
    const result = await connection(async (c) => {
      const periods = await run(
        c,
        "SELECT NPE_ID,NPE_ANIO,NPE_MES,NPE_QUINCENA FROM NOM_PERIODO WHERE NPE_ESTADO NOT IN ('CERRADO','ANULADO')",
      );
      const pending = (
        await run(
          c,
          'SELECT COUNT(*) AS "total" FROM NOM_VACACION v JOIN NOM_EMPLEADO e ON e.EML_ID=v.EML_ID WHERE e.EMP_ID=TO_NUMBER(:company) AND v.VAC_ESTADO=\'SOLICITADA\'',
          { company: req.nominaActor.companyId },
        )
      )[0].total;
      const incomplete = await run(
        c,
        'SELECT m.NPE_ID,COUNT(*) AS "total" FROM NOM_MARCAJE m JOIN NOM_RELACION_LABORAL r ON r.RLA_ID=m.RLA_ID JOIN NOM_EMPLEADO e ON e.EML_ID=r.EML_ID WHERE e.EMP_ID=TO_NUMBER(:company) AND (m.MRC_ENTRADA IS NULL OR m.MRC_SALIDA IS NULL) AND m.AUS_ID IS NULL AND m.VAC_ID IS NULL GROUP BY m.NPE_ID',
        { company: req.nominaActor.companyId },
      );
      return periods.flatMap((p) => {
        const d =
          Number(p.NPE_QUINCENA) === 1
            ? 15
            : new Date(Number(p.NPE_ANIO), Number(p.NPE_MES), 0).getDate();
        const cutoff = `${p.NPE_ANIO}-${String(p.NPE_MES).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const days = Math.round((Date.parse(cutoff) - Date.parse(today)) / 86400000);
        if (!businessRules.closingNoticeDays.includes(days)) return [];
        return [
          {
            id: p.NPE_ID,
            cutoff,
            days,
            message: `El corte del ${cutoff} ${days === 0 ? 'es hoy' : `es en ${days} día(s)`}. Hay ${pending} vacación(es) pendiente(s) de aprobar y ${incomplete.find((m) => m.NPE_ID === p.NPE_ID)?.total || 0} marcaje(s) incompleto(s) en este período.`,
            slug: 'vacacion',
            params: { filterField: 'VAC_ESTADO', filterValue: 'SOLICITADA' },
            attendance: { filterField: 'NPE_ID', filterValue: p.NPE_ID, pending: '1' },
          },
        ];
      });
    });
    res.json(result);
  });
  router.get('/recomendaciones', async (req, res) =>
    res.json(
      await connection(async (c) => {
        const own = req.nominaActor.role === roles.EMPLOYEE;
        return run(
          c,
          `SELECT NRE_ID,NRE_NOMBRE,NRE_TELEFONO,NRE_CORREO,NRE_PUESTO,NRE_MOTIVO,NRE_ESTADO,NRE_USUARIO${own ? '' : ',NRE_NOTA'} FROM NOM_RECOMENDACION WHERE NRE_EMPRESA=TO_NUMBER(:company)${own ? ' AND NRE_USUARIO=TO_NUMBER(:userId)' : ''} ORDER BY NRE_ID DESC`,
          { company: req.nominaActor.companyId, ...(own ? { userId: req.nominaActor.id } : {}) },
        );
      }),
    ),
  );
  router.post('/recomendaciones', async (req, res) => {
    const b = req.body || {},
      name = String(b.name || '').trim(),
      reason = String(b.reason || '').trim();
    if (
      !name ||
      name.length > 200 ||
      !reason ||
      reason.length > 1000 ||
      (!b.phone && !b.email) ||
      (b.phone && !validPhone(b.phone)) ||
      (b.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(b.email)) ||
      String(b.email || '').length > 200 ||
      !/^\d{1,38}$/.test(String(b.position))
    )
      throw new ApiError(
        422,
        'Completa nombre, puesto, motivo y un teléfono de 8 dígitos o correo válido.',
      );
    await connection(
      (c) =>
        c.execute(
          'INSERT INTO NOM_RECOMENDACION(NRE_EMPRESA,NRE_USUARIO,NRE_NOMBRE,NRE_TELEFONO,NRE_CORREO,NRE_PUESTO,NRE_MOTIVO) VALUES(TO_NUMBER(:company),TO_NUMBER(:userId),:name,:phone,:email,TO_NUMBER(:position),:reason)',
          {
            company: req.nominaActor.companyId,
            userId: req.nominaActor.id,
            name,
            phone: b.phone ? String(b.phone).replace('-', '') : null,
            email: b.email || null,
            position: String(b.position),
            reason,
          },
        ),
      { write: true },
    );
    res.status(201).json({ message: 'Recomendación recibida.' });
  });
  router.put('/recomendaciones/:id', async (req, res) => {
    requireRole(req.nominaActor, [roles.SYSTEM, roles.PAYROLL]);
    if (
      !/^\d{1,38}$/.test(req.params.id) ||
      !['RECIBIDA', 'EN_REVISION', 'CONTRATADA', 'DESCARTADA'].includes(req.body?.state) ||
      String(req.body?.note || '').length > 1000
    )
      throw new ApiError(422, 'Selecciona un estado válido y una nota de hasta 1000 caracteres.');
    await connection(
      async (c) => {
        const [before] = await run(
          c,
          'SELECT NRE_ID,NRE_ESTADO,NRE_NOTA FROM NOM_RECOMENDACION WHERE NRE_ID=TO_NUMBER(:id) AND NRE_EMPRESA=TO_NUMBER(:company) FOR UPDATE',
          { id: req.params.id, company: req.nominaActor.companyId },
        );
        if (!before) throw new ApiError(404, 'Recomendación no encontrada.');
        await c.execute(
          'UPDATE NOM_RECOMENDACION SET NRE_ESTADO=:state,NRE_NOTA=:note WHERE NRE_ID=TO_NUMBER(:id)',
          { state: req.body.state, note: req.body.note || null, id: req.params.id },
        );
        await audit(
          c,
          catalog,
          'NOM_RECOMENDACION',
          req.params.id,
          'REVISAR',
          before,
          { NRE_ESTADO: req.body.state, NRE_NOTA: req.body.note || null },
          changeContext(req),
        );
      },
      { write: true },
    );
    res.status(204).end();
  });
  return router;
}
