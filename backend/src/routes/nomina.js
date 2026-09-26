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
  router.use(async (req, _res, next) => {
    if (resolveActor) req.nominaActor = await resolveActor(req);
    next();
  });
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
    res.json({ tables, groups: [...groups, ...masterGroups], externalMode }),
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
    res.json(await connection((c) => dashboard(c, req.query))),
  );
  router.post('/hr/contrataciones', async (req, res) =>
    res.status(201).json(
      await connection(
        async (c) => {
          const result = await hire(c, req.body, catalog);
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
    res.json(await connection((c) => lookup(c, table, catalog, req.query)));
  });
  for (const table of tables) {
    const repo = repositories.get(table.slug),
      path = '/' + table.slug;
    router.get(path, async (req, res) =>
      res.json(await connection((c) => repo.list(c, req.query))),
    );
    router.get(path + '/exportar', async (req, res) => {
      const result = await connection(async (c) => {
        await c.execute('SET TRANSACTION READ ONLY');
        const first = await repo.list(c, { ...req.query, page: '1', pageSize: '100' });
        if (first.total > 10000)
          throw new ApiError(
            422,
            'La exportación admite hasta 10,000 registros. Acota los filtros.',
          );
        const rows = [...first.rows];
        for (let page = 2; page <= Math.ceil(first.total / 100); page++)
          rows.push(
            ...(await repo.list(c, { ...req.query, page: String(page), pageSize: '100' })).rows,
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
      res.json(await connection((c) => repo.get(c, identifier(req.params.id)))),
    );
    router.post(path, async (req, res) => {
      const data = payload(table, req.body, { create: true });
      const row = await connection(
        async (c) => {
          await guardMutation(c, catalog, table, data, null, changeContext(req));
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
          const merged = { ...previous, ...req.body };
          delete merged[table.pk];
          const data = payload(table, merged, { create: false });
          await guardMutation(c, catalog, table, data, previous, changeContext(req));
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
      status = 503;
      message = 'No se pudo completar la operación. Comprueba la conexión con la base de datos.';
      console.error('[NOM]', err.code || 'DATABASE_ERROR');
    }
    res.status(status).json({
      message,
      fields,
      code: status === 503 ? 'DATABASE_UNAVAILABLE' : 'DATABASE_CONSTRAINT',
    });
  });
  return router;
}
