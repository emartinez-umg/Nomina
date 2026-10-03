import { bootstrapUser } from './lib/bootstrap-user.js';
import { loadEnvFile } from 'node:process';
import { createPool } from '../backend/src/config/pool.js';
import { installWorkflow } from '../backend/src/services/workflow-schema.js';
loadEnvFile('.env');
const pool = await createPool();
const c = await pool.getConnection();
try {
  await installWorkflow(c);
  if (await bootstrapUser(c))
    console.log(
      'Administrador inicial creado. Consulta .nomina-admin-inicial.txt y cambia su contraseña al ingresar.',
    );
  console.log(
    'Actualización de Nómina instalada: seguimiento, correlativos, accesos y portal del personal.',
  );
} finally {
  await c.close();
  await pool.close();
}
