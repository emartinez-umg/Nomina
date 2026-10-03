import { createPool } from './config/pool.js';
import { createApp } from './app.js';
let pool;
try {
  pool = await createPool();
  const connection = await pool.getConnection();
  try {
    await connection.execute('SELECT 1 FROM DUAL');
  } finally {
    await connection.close();
  }
} catch (error) {
  console.error(
    'No se pudo iniciar Nómina: verifica que Oracle esté disponible y revisa NOM_DB_USER, NOM_DB_PASSWORD y NOM_DB_CONNECT_STRING.',
    error.code || 'DATABASE_ERROR',
  );
  if (pool) await pool.close(0);
  process.exit(1);
}
const app = createApp({
  pool,
  authentication: true,
  basePath: process.env.NOM_API_BASE || '/api/nomina',
  corsOrigin: process.env.NOM_CORS_ORIGIN || 'http://localhost:5173',
  externalMode: process.env.NOM_EXTERNAL_MODE || 'erp',
});
const server = app.listen(Number(process.env.PORT || 3001), process.env.HOST || '127.0.0.1', () =>
  console.log(
    `Nómina API: http://${process.env.HOST || '127.0.0.1'}:${process.env.PORT || 3001}${process.env.NOM_API_BASE || '/api/nomina'}`,
  ),
);
let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  const timeout = setTimeout(() => process.exit(1), 12000);
  timeout.unref();
  server.close(async () => {
    try {
      await pool.close(5);
    } finally {
      process.exit(0);
    }
  });
  server.closeIdleConnections();
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
