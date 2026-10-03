import { personalRouter } from '../services/personal.js';
import { canUseTable, roleLabels } from '../../../shared/access.js';
import {
  authorizeTable,
  assertInputAccess,
  assertRowAccess,
  scopedQuery,
  creatorFields,
  requireRole,
  roles,
} from '../services/access.js';
import { authService, createUser } from '../services/auth.js';
import { removePeriod } from '../services/periods.js';
import { recordVersion, assertVersion } from '../services/record-version.js';
import { toCsv } from '../../../shared/workflow.js';
import {
  audit,
  syncEmployment,
  changeContext,
  guardMutation,
  history,
  payrollReview,
  payrollAction,
  reviewSource,
  vacationReview,
  vacationAction,
  terminationReview,
  terminate,
  liquidationReview,
  payLiquidation,
} from '../services/workflow.js';
import { Router } from 'express';
import { checkFields } from '../../../shared/checks.js';
import { masterGroups } from '../../../shared/hr-catalog.js';
import { hire, dashboard, validateRelations } from '../services/hr.js';
import { groups } from '../../../shared/catalog.js';
import { tables, createCatalog } from '../config/catalog.js';
import { createRepositories } from '../repositories/index.js';
import { ApiError, lookup } from '../repositories/repository.js';
import { payload, identifier } from '../validators/payload.js';
export function createNominaRouter({
  pool,
  externalCatalogs = [],
  externalMode = 'erp',
  resolveActor,
  authentication = true,
} = {}) {
  const router = Router(),
    catalog = createCatalog(externalCatalogs),
    repositories = createRepositories(catalog);
  async function connection(work, { write = false } = {}) {
    const c = await pool.getConnection();
    try {
      const result = await work(c);
      if (write) await c.commit();
      return result;
    } catch (e) {
      if (write) await c.rollback();
      throw e;
    } finally {
      await c.close();
    }
  }
  if (authentication) {
    const auth = authService(pool);
    router.use('/auth', auth.router);
    router.use((req, res, next) =>
      req.path === '/health' ? next() : auth.requireSession(req, res, next),
    );
  } else router.get('/auth/session', (_req, res) => res.json({ localMode: true }));
  router.get('/admin/usuarios', async (req, res) => {
    requireRole(req.nominaActor, [roles.SYSTEM]);
    if (!req.nominaActor?.role)
      throw new ApiError(403, 'Activa la autenticación para administrar usuarios.');
    res.json(
      await connection(
        async (c) =>
          (
            await c.execute(
              "SELECT u.USU_ID,u.USU_LOGIN,u.USU_ACTIVO,r.ROL_NOMBRE,ur.EMP_ID,e.EMP_RAZON_SOCIAL FROM ERP_USUARIO u JOIN ERP_USUARIO_ROL ur ON ur.USU_ID=u.USU_ID JOIN ERP_ROL r ON r.ROL_ID=ur.ROL_ID JOIN ERP_EMPRESA e ON e.EMP_ID=ur.EMP_ID WHERE r.ROL_NOMBRE LIKE 'NOMINA_%' ORDER BY u.USU_LOGIN",
              {},
              (await import('../config/pool.js')).executeOptions,
            )
          ).rows,
      ),
    );
  });
  router.post('/admin/usuarios', async (req, res) => {
    requireRole(req.nominaActor, [roles.SYSTEM]);
    if (!req.nominaActor?.role)
      throw new ApiError(403, 'Activa la autenticación para administrar usuarios.');
    res.status(201).json(
      await connection(
        async (c) => {
          const user = await createUser(c, req.body);
          await audit(
            c,
            catalog,
            'ERP_USUARIO',
            user.id,
            'CREAR_USUARIO',
            null,
            { login: user.login, memberships: user.memberships },
            changeContext(req),
          );
          return user;
        },
        { write: true },
      ),
    );
  });
  router.put('/admin/usuarios/:id/rol', async (req, res) => {
    requireRole(req.nominaActor, [roles.SYSTEM]);
    if (!req.nominaActor?.role) throw new ApiError(403, 'Inicia sesión como administrador.');
    const id = identifier(req.params.id),
      company = identifier(String(req.body?.companyId || '')),
      role = req.body?.role;
    if (!roleLabels[role]) throw new ApiError(422, 'Selecciona un rol válido.');
    await connection(
      async (c) => {
        await c.execute("SELECT ROL_ID FROM ERP_ROL WHERE ROL_NOMBRE='NOMINA_SISTEMA' FOR UPDATE");
        const current = await c.execute(
          "SELECT ur.URL_ID,r.ROL_NOMBRE FROM ERP_USUARIO_ROL ur JOIN ERP_ROL r ON r.ROL_ID=ur.ROL_ID WHERE ur.USU_ID=TO_NUMBER(:id) AND ur.EMP_ID=TO_NUMBER(:company) AND r.ROL_NOMBRE IN ('NOMINA_SISTEMA','NOMINA_ADMIN','NOMINA_COLABORADOR')",
          { id, company },
        );
        const exists = await c.execute(
          'SELECT NUP_USUARIO FROM NOM_USUARIO_PERFIL WHERE NUP_USUARIO=TO_NUMBER(:id)',
          { id },
        );
        if (!exists.rows.length) throw new ApiError(404, 'Usuario de Nómina no encontrado.');
        if (id === req.nominaActor.id && role !== roles.SYSTEM)
          throw new ApiError(
            409,
            'Otro administrador debe cambiar tu rol para evitar perder el acceso de administración.',
          );
        const target = await c.execute(
          'SELECT ROL_ID FROM ERP_ROL WHERE ROL_NOMBRE=:role AND ROL_ACTIVO=1',
          { role },
        );
        const roleId = String(target.rows[0]?.ROL_ID ?? target.rows[0]?.[0] ?? '');
        if (!roleId) throw new ApiError(422, 'Rol no disponible.');
        for (const row of current.rows)
          await c.execute('DELETE FROM ERP_USUARIO_ROL WHERE URL_ID=TO_NUMBER(:id)', {
            id: String(row.URL_ID ?? row[0]),
          });
        await c.execute(
          'INSERT INTO ERP_USUARIO_ROL(USU_ID,ROL_ID,EMP_ID) VALUES(TO_NUMBER(:id),TO_NUMBER(:roleId),TO_NUMBER(:company))',
          { id, roleId, company },
        );
        await c.execute('DELETE FROM NOM_SESION WHERE NSN_USUARIO=TO_NUMBER(:id)', { id });
        await audit(
          c,
          catalog,
          'ERP_USUARIO',
          id,
          'CAMBIAR_ROL',
          null,
          { role, company },
          changeContext(req),
        );
      },
      { write: true },
    );
    res.status(204).end();
  });
  router.post('/perfil/recorrido', async (req, res) => {
    if (!req.nominaActor?.id) throw new ApiError(401, 'Inicia sesión.');
    await connection(
      (c) =>
        c.execute('UPDATE NOM_USUARIO_PERFIL SET NUP_TOUR=1 WHERE NUP_USUARIO=TO_NUMBER(:id)', {
          id: req.nominaActor.id,
        }),
      { write: true },
    );
    res.status(204).end();
  });
  router.use(async (req, _res, next) => {
    if (!authentication && resolveActor) req.nominaActor = await resolveActor(req);
    next();
  });
  router.use(async (req, _res, next) => {
    const actor = req.nominaActor;
    if (!actor?.role || req.path === '/health' || req.path === '/metadata') return next();
    const pieces = req.path.split('/').filter(Boolean);
    if (pieces[0] === 'hr') {
      requireRole(actor, [roles.SYSTEM, roles.PAYROLL]);
      const target = {
        planilla: 'NOM_NOMINA',
        vacacion: 'NOM_VACACION',
        baja: 'NOM_RELACION_LABORAL',
        liquidacion: 'NOM_LIQUIDACION_LABORAL',
      }[pieces[1]];
      if (target && pieces[2])
        await connection((c) =>
          assertRowAccess(c, actor, catalog.get(target), catalog, identifier(pieces[2])),
        );
      if (pieces[1] === 'historial') {
        const t = req.query.employee ? catalog.get('NOM_EMPLEADO') : catalog.get(req.query.entity);
        if (!t) throw new ApiError(400, 'Entidad no válida.');
        await connection((c) =>
          assertRowAccess(c, actor, t, catalog, identifier(req.query.employee || req.query.id)),
        );
      }
    } else if (pieces[0] === 'lookups') {
      if (actor.role === roles.EMPLOYEE && pieces[1] !== 'NOM_PUESTO')
        throw new ApiError(403, 'Catálogo no disponible para tu rol.');
      const t = catalog.get(pieces[1]);
      if (t && req.query.id)
        await connection((c) => assertRowAccess(c, actor, t, catalog, identifier(req.query.id)));
    } else {
      const t = tables.find((t) => t.slug === pieces[0]);
      if (t) {
        authorizeTable(actor, t, !['GET', 'HEAD'].includes(req.method));
        if (pieces[1] && pieces[1] !== 'exportar')
          await connection((c) => assertRowAccess(c, actor, t, catalog, identifier(pieces[1])));
      }
    }
    next();
  });
  router.use('/personal', personalRouter(connection, catalog));
  router.get('/hr/historial', async (req, res) =>
    res.json(await connection((c) => history(c, req.query))),
  );
  for (const [kind, read, write] of [
    ['planilla', payrollReview, payrollAction],
    ['vacacion', vacationReview, vacationAction],
    ['baja', terminationReview, terminate],
    ['liquidacion', liquidationReview, payLiquidation],
  ]) {
    router.get(`/hr/${kind}/:id`, async (req, res) =>
      res.json(await connection((c) => read(c, catalog, identifier(req.params.id)))),
    );
    router.post(`/hr/${kind}/:id`, async (req, res) => {
      if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body))
        throw new ApiError(400, 'Envía los datos de la revisión.');
      res.json(
        await connection(
          (c) => write(c, catalog, identifier(req.params.id), req.body, changeContext(req)),
          { write: true },
        ),
      );
    });
  }
  router.post('/hr/planilla/:id/novedad', async (req, res) =>
    res.json(
      await connection(
        (c) => reviewSource(c, catalog, identifier(req.params.id), req.body, changeContext(req)),
        { write: true },
      ),
    ),
  );
  router.get('/metadata', (_req, res) =>
    res.json({
      tables: tables.filter(
        (t) => !_req.nominaActor?.role || canUseTable(_req.nominaActor.role, t),
      ),
      groups: [...groups, ...masterGroups],
      externalMode,
    }),
  );
  router.get('/health', async (_req, res) => {
    try {
      await connection((c) => c.execute('SELECT 1 FROM DUAL'));
      res.json({ status: 'ok', database: 'Oracle', externalMode });
    } catch {
      res
        .status(503)
        .json({ status: 'unavailable', message: 'No se pudo conectar con la base de datos.' });
    }
  });
  router.get('/hr/dashboard', async (req, res) =>
    res.json(
      await connection((c) =>
        dashboard(
          c,
          req.nominaActor?.role ? { ...req.query, company: req.nominaActor.companyId } : req.query,
        ),
      ),
    ),
  );
  router.post('/hr/contrataciones', async (req, res) =>
    res.status(201).json(
      await connection(
        async (c) => {
          await assertInputAccess(
            c,
            req.nominaActor,
            catalog.get('NOM_EMPLEADO'),
            catalog,
            req.body?.employee || {},
          );
          if (req.body?.recommendationId) {
            if (!req.nominaActor?.role)
              throw new ApiError(403, 'Inicia sesión para contratar desde una recomendación.');
            const referral = await c.execute(
              'SELECT NRE_ID,NRE_ESTADO FROM NOM_RECOMENDACION WHERE NRE_ID=TO_NUMBER(:id) AND NRE_EMPRESA=TO_NUMBER(:company) FOR UPDATE',
              { id: identifier(req.body.recommendationId), company: req.nominaActor.companyId },
            );
            if (!referral.rows.length) throw new ApiError(404, 'Recomendación no encontrada.');
            const state = referral.rows[0].NRE_ESTADO ?? referral.rows[0][1];
            if (state === 'CONTRATADA')
              throw new ApiError(409, 'Esta recomendación ya fue contratada.');
          }
          const result = await hire(
            c,
            {
              ...req.body,
              relation: creatorFields(
                req.nominaActor,
                req.body?.relation,
                catalog.get('NOM_RELACION_LABORAL'),
              ),
            },
            catalog,
          );
          if (req.body?.recommendationId) {
            await c.execute(
              "UPDATE NOM_RECOMENDACION SET NRE_ESTADO='CONTRATADA' WHERE NRE_ID=TO_NUMBER(:id)",
              { id: req.body.recommendationId },
            );
            await audit(
              c,
              catalog,
              'NOM_RECOMENDACION',
              req.body.recommendationId,
              'CONTRATAR',
              null,
              { NRE_ESTADO: 'CONTRATADA', EML_ID: result.employee.EML_ID },
              changeContext(req),
            );
          }
          await audit(
            c,
            catalog,
            'NOM_EMPLEADO',
            result.employee.EML_ID,
            'CONTRATACION',
            null,
            result.employee,
            changeContext(req),
          );
          await audit(
            c,
            catalog,
            'NOM_RELACION_LABORAL',
            result.relation.RLA_ID,
            'CONTRATACION',
            null,
            result.relation,
            changeContext(req),
          );
          return result;
        },
        { write: true },
      ),
    ),
  );
  router.get('/lookups/:table', async (req, res) => {
    const table = catalog.get(req.params.table);
    if (!table) throw new ApiError(404, 'Catálogo no disponible.');
    res.json(
      await connection((c) =>
        lookup(c, table, catalog, scopedQuery(req.nominaActor, table, catalog, req.query)),
      ),
    );
  });
  for (const table of tables) {
    const repo = repositories.get(table.slug),
      path = '/' + table.slug;
    router.get(path, async (req, res) =>
      res.json(
        await connection((c) =>
          repo.list(c, scopedQuery(req.nominaActor, table, catalog, req.query)),
        ),
      ),
    );
    router.get(path + '/exportar', async (req, res) => {
      const result = await connection(async (c) => {
        await c.execute('SET TRANSACTION READ ONLY');
        const first = await repo.list(c, {
          ...scopedQuery(req.nominaActor, table, catalog, req.query),
          page: '1',
          pageSize: '100',
        });
        if (first.total > 10000)
          throw new ApiError(
            422,
            'La exportación admite hasta 10,000 registros. Acota los filtros.',
          );
        const rows = [...first.rows];
        for (let page = 2; page <= Math.ceil(first.total / 100); page++)
          rows.push(
            ...(
              await repo.list(c, {
                ...scopedQuery(req.nominaActor, table, catalog, req.query),
                page: String(page),
                pageSize: '100',
              })
            ).rows,
          );
        const requested = String(req.query.columns || '').split(',');
        const fields = table.fields.filter((f) => requested.includes(f.name));
        const selected = fields.length ? fields : table.fields;
        return {
          filename: table.slug + '.csv',
          csv: toCsv(
            selected.map((f) => f.label),
            rows.map((r) => selected.map((f) => (f.ref ? r['__LABEL_' + f.name] : r[f.name]))),
          ),
          total: rows.length,
        };
      });
      res.json(result);
    });
    router.get(path + '/:id', async (req, res) =>
      res.json(
        await connection(async (c) => {
          const row = await repo.get(c, identifier(req.params.id));
          return { ...row, __version: recordVersion(table, row) };
        }),
      ),
    );
    router.post(path, async (req, res) => {
      const data = payload(table, creatorFields(req.nominaActor, req.body, table), {
        create: true,
      });
      const row = await connection(
        async (c) => {
          await guardMutation(c, catalog, table, data, null, changeContext(req));
          await assertInputAccess(c, req.nominaActor, table, catalog, data);
          await validateRelations(c, table, data, catalog);
          const id = await repo.create(c, data);
          const result = await repo.get(c, id);
          await syncEmployment(c, catalog, table, result, changeContext(req));
          await audit(c, catalog, table.name, id, 'CREAR', null, result, changeContext(req));
          return result;
        },
        { write: true },
      );
      res.status(201).json(row);
    });
    router.put(path + '/:id', async (req, res) => {
      const id = identifier(req.params.id);
      if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body))
        throw new ApiError(400, 'Envía un objeto con los cambios.');
      for (const key of Object.keys(req.body))
        if (!table.fields.some((f) => f.name === key && !f.identity))
          throw new ApiError(422, 'Campo no editable.', {
            [key]: 'Este campo no se puede modificar.',
          });
      const row = await connection(
        async (c) => {
          const previous = await repo.get(c, id, true);
          if (req.nominaActor?.role && !req.get('If-Match'))
            throw new ApiError(
              428,
              'Vuelve a abrir el registro antes de guardar.',
              {},
              'VERSION_REQUIRED',
            );
          assertVersion(table, previous, req.get('If-Match'));
          if (
            req.nominaActor?.role &&
            req.body.USU_ID_CREA &&
            req.body.USU_ID_CREA !== previous.USU_ID_CREA
          )
            throw new ApiError(422, 'El usuario creador no se puede cambiar.');
          const merged = { ...previous, ...req.body };
          delete merged[table.pk];
          const data = payload(table, merged, { create: false });
          await guardMutation(c, catalog, table, data, previous, changeContext(req));
          await assertInputAccess(c, req.nominaActor, table, catalog, data);
          await validateRelations(c, table, data, catalog);
          await repo.update(c, id, data);
          const result = await repo.get(c, id);
          await syncEmployment(c, catalog, table, result, changeContext(req));
          await audit(c, catalog, table.name, id, 'EDITAR', previous, result, changeContext(req));
          return result;
        },
        { write: true },
      );
      res.json(row);
    });
    router.delete(path + '/:id', async (req, res) => {
      const id = identifier(req.params.id),
        policy = table.lifecycle;
      if (table.name === 'NOM_PERIODO') {
        await connection((c) => removePeriod(c, catalog, id, changeContext(req)), { write: true });
        return res.status(204).end();
      }
      if (policy.mode === 'state')
        throw new ApiError(
          409,
          'Esta tabla conserva sus estados de negocio. Edita el estado explícitamente; no tiene inactivación ni anulación definidas.',
          {},
          'EXPLICIT_STATE_REQUIRED',
        );
      await connection(
        async (c) => {
          const previous = await repo.get(c, id, true);
          const after =
            policy.mode === 'delete' ? null : { ...previous, [policy.field]: policy.value };
          await guardMutation(
            c,
            catalog,
            table,
            after || previous,
            previous,
            changeContext(req),
            policy.mode === 'delete',
          );
          if (policy.mode === 'delete') await repo.remove(c, id);
          else await repo.update(c, id, { [policy.field]: policy.value });
          await audit(
            c,
            catalog,
            table.name,
            id,
            policy.mode === 'delete' ? 'ELIMINAR' : 'INACTIVAR',
            previous,
            after,
            changeContext(req),
          );
        },
        { write: true },
      );
      res.status(204).end();
    });
  }
  router.use((_req, _res, next) => next(new ApiError(404, 'Ruta de Nómina no encontrada.')));
  router.use((err, _req, res, _next) => {
    if (err instanceof ApiError)
      return res
        .status(err.status)
        .json({ message: err.message, fields: err.fields, code: err.code });
    let message,
      fields = {},
      status = 409;
    if (err.errorNum === 1) {
      const constraint = String(err.message).match(/\((?:[^.()]+\.)?([^()]+)\)/)?.[1];
      const unique = tables.flatMap((t) => t.unique).find((u) => u.name === constraint);
      message =
        constraint === 'UX_NOM_NPE_ABIERTO'
          ? 'Ya existe un período abierto para este tipo y quincena.'
          : 'Ya existe un registro con esa combinación de valores.';
      for (const f of unique?.fields ||
        (constraint === 'UX_NOM_NPE_ABIERTO' ? ['NPE_TIPO', 'NPE_QUINCENA', 'NPE_ESTADO'] : []))
        fields[f] = message;
    } else if (err.errorNum === 2291) {
      message = 'La referencia seleccionada ya no existe. Vuelve a seleccionarla.';
      const ref = tables
        .flatMap((t) => t.fields)
        .find((f) => f.ref && String(err.message).includes(f.ref.constraint));
      if (ref) fields[ref.name] = message;
    } else if (err.errorNum === 2292)
      message = 'No se puede eliminar: otros registros dependen de este registro.';
    else if ([2290, 1400, 12899, 1438, 1861, 1847].includes(err.errorNum)) {
      status = 422;
      message = 'Los datos no cumplen las restricciones de la base de datos.';
      if (err.errorNum === 1400) {
        const column = String(err.message).match(/"([A-Z][A-Z0-9_]+)"\)/)?.[1];
        const field = tables.flatMap((t) => t.fields).find((f) => f.name === column);
        if (field) {
          message = `Completa ${field.label.toLowerCase()}.`;
          fields[field.name] = message;
        }
      }
      const check = tables
        .flatMap((t) => t.checks)
        .find((c) => String(err.message).includes(c.name));
      if (check) {
        message = 'Revisa los valores relacionados del formulario.';
        for (const f of checkFields(check.ast)) fields[f] = message;
      }
    } else if (err.errorNum === 60) {
      status = 409;
      message =
        'Otro operador está actualizando esta gestión. Tus cambios no se guardaron; actualiza la revisión e inténtalo de nuevo.';
    } else if (err.type === 'entity.parse.failed') {
      status = 400;
      message = 'El cuerpo JSON no es válido.';
    } else {
      const unavailable =
        /^(NJS-(040|047|500|503|511)|DPI-10(10|47)|ORA-(01017|12154|12514|12541|28000))/.test(
          err.code || '',
        ) || [1017, 12154, 12514, 12541, 28000].includes(err.errorNum);
      status = unavailable ? 503 : 500;
      message = unavailable
        ? 'No se pudo conectar con Oracle. Reintenta o avisa al administrador.'
        : 'No se pudo completar la operación. Conserva tus cambios y avisa a soporte.';
    }
    console.error('[NOM]', err.code || 'DATABASE_ERROR', err.message || 'Error sin detalle');
    res.status(status).json({
      message,
      fields,
      code:
        status === 503
          ? 'DATABASE_UNAVAILABLE'
          : status === 500
            ? 'INTERNAL_ERROR'
            : 'DATABASE_CONSTRAINT',
    });
  });
  return router;
}
