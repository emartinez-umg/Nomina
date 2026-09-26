import { createPool } from './config/pool.js';
import { createApp } from './app.js';
const pool = await createPool();
const app = createApp({
  pool,
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
