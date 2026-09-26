import { loadEnvFile } from 'node:process';
import { createPool } from '../backend/src/config/pool.js';
import { installWorkflow } from '../backend/src/services/workflow-schema.js';
loadEnvFile('.env');
const pool = await createPool();
const c = await pool.getConnection();
try {
  await installWorkflow(c);
  console.log('Tablas de seguimiento de RR. HH. disponibles.');
} finally {
  await c.close();
  await pool.close();
}
