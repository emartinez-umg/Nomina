import { verifyPayrollScenarios } from './lib/verify-payroll-scenarios.js';
import { verifyPending } from './lib/verify-pending.js';
// End-to-end workflows in a disposable Oracle schema. Existing records are never used.
import oracledb from 'oracledb';
import { loadEnvFile } from 'node:process';
import { readFileSync } from 'node:fs';
import { parseScript } from './lib/sql-script.js';
import { demoData } from './lib/demo-data.js';
import { insertRows, seedCatalogs } from './lib/migration-data.js';
import { installWorkflow } from '../backend/src/services/workflow-schema.js';
import { createPool } from '../backend/src/config/pool.js';
import { createApp } from '../backend/src/app.js';
import { verifyVacations } from './lib/verify-vacations.js';
import { verifyWorkflow } from './lib/verify-workflow.js';
loadEnvFile('.env');
const user = 'HR_FLOW_TEST_' + Date.now(),
  password = 'Test' + Date.now() + 'Flow';
const admin = await oracledb.getConnection({
  user: 'SYSTEM',
  password: process.env.ORACLE_PWD,
  connectString: process.env.NOM_DB_CONNECT_STRING,
});
let created = false,
  c,
  pool;
try {
  await admin.execute(
    `CREATE USER ${user} IDENTIFIED BY "${password}" DEFAULT TABLESPACE USERS QUOTA UNLIMITED ON USERS`,
  );
  created = true;
  await admin.execute(`GRANT CREATE SESSION,CREATE TABLE,CREATE SEQUENCE TO ${user}`);
  c = await oracledb.getConnection({
    user,
    password,
    connectString: process.env.NOM_DB_CONNECT_STRING,
  });
  for (const { sql } of parseScript(readFileSync('db/ERP_ESQUEMA_FINAL.sql', 'utf8')))
    await c.execute(sql);
  await installWorkflow(c);
  await installWorkflow(c); // Additive migration is repeatable.
  await insertRows(c, demoData());
  await seedCatalogs(c);
  pool = await createPool({ ...process.env, NOM_DB_USER: user, NOM_DB_PASSWORD: password });
  await verifyWorkflow(createApp({ pool, authentication: false }));
  await verifyVacations(createApp({ pool, authentication: false }));
  await verifyPending(pool, c);
  await verifyPayrollScenarios(createApp({ pool, authentication: false }));
} finally {
  if (pool) await pool.close(0);
  if (c) await c.close();
  if (created) await admin.execute(`DROP USER ${user} CASCADE`);
  await admin.close();
  console.log('Esquema temporal eliminado.');
}
