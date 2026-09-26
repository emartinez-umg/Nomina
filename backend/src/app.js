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
}) {
  const app = express();
  app.disable('x-powered-by');
  app.use(cors({ origin: corsOrigin }));
  app.use(express.json({ limit: '100kb' }));
  app.use(basePath, createNominaRouter({ pool, externalMode, externalCatalogs, resolveActor }));
  app.use((err, _req, res, _next) =>
    res.status(err.status === 413 ? 413 : 400).json({
      message:
        err.status === 413
          ? 'El formulario excede el tamaño permitido.'
          : 'El cuerpo JSON no es válido.',
      fields: {},
    }),
  );
  return app;
}
