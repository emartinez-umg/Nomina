import express from 'express';
import cors from 'cors';
import { createNominaRouter } from './routes/nomina.js';
export { createNominaRouter };
export function createApp({
  pool,
  basePath = '/api/nomina',
  corsOrigin = 'http://localhost:5173',
  externalMode = 'erp',
  externalCatalogs = [],
  resolveActor,
  authentication = true,
}) {
  const app = express();
  app.disable('x-powered-by');
  app.use(cors({ origin: corsOrigin, credentials: true }));
  app.use(express.json({ limit: '100kb' }));
  app.use(
    basePath,
    createNominaRouter({ pool, externalMode, externalCatalogs, resolveActor, authentication }),
  );
  app.use((err, _req, res, _next) =>
    res.status(err.status === 413 ? 413 : 400).json({
      message:
        err.status === 413
          ? 'El formulario excede el tamaño permitido.'
          : 'El cuerpo JSON no es válido.',
      fields: {},
      code: err.status === 413 ? 'BODY_TOO_LARGE' : 'INVALID_JSON',
    }),
  );
  return app;
}
