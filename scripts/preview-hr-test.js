import { createUser } from '../backend/src/services/auth.js';
// Isolated manual browser QA. Ctrl+C closes both servers and removes the disposable schema.
import { installWorkflow } from '../backend/src/services/workflow-schema.js';
import oracledb from 'oracledb';
import { loadEnvFile } from 'node:process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { parseScript } from './lib/sql-script.js';
import { demoData } from './lib/demo-data.js';
import { insertRows, seedCatalogs } from './lib/migration-data.js';
import { createPool } from '../backend/src/config/pool.js';
import { createApp } from '../backend/src/app.js';
loadEnvFile('.env');
const user = 'HR_UI_TEST_' + Date.now(),
  password = 'Test' + Date.now() + 'HrPreview';
let admin,
  c,
  pool,
  server,
  vite,
  created = false;
let end;
const stopped = new Promise((resolve) => {
  end = resolve;
});
process.once('SIGINT', end);
process.once('SIGTERM', end);
try {
  admin = await oracledb.getConnection({
    user: 'SYSTEM',
    password: process.env.ORACLE_PWD,
    connectString: process.env.NOM_DB_CONNECT_STRING,
  });
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
  await insertRows(c, demoData());
  await seedCatalogs(c);
  await installWorkflow(c);
  const authentication = process.argv.includes('--auth');
  if (authentication) {
    const person = await c.execute(
      "INSERT INTO ERP_PERSONA(PER_TIPO,PER_NOMBRES,PER_APELLIDOS) VALUES('F','Administrador','Vista de prueba') RETURNING PER_ID INTO :id",
      { id: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 80 } },
    );
    await createUser(c, {
      login: 'qa.preview',
      password: 'Nomina-Preview-2026!',
      personId: String(person.outBinds.id[0]),
      companyId: '1',
      role: 'NOMINA_SISTEMA',
    });
    // UI fixture already completed onboarding. Password change is covered by test:workflow.
    await c.execute(
      "UPDATE NOM_USUARIO_PERFIL SET NUP_CAMBIO=0 WHERE NUP_USUARIO=(SELECT USU_ID FROM ERP_USUARIO WHERE USU_LOGIN='qa.preview')",
    );
    await c.commit();
  }
  pool = await createPool({ ...process.env, NOM_DB_USER: user, NOM_DB_PASSWORD: password });
  server = createApp({ pool, authentication }).listen(3002, '127.0.0.1');
  vite = await createServer({
    root: fileURLToPath(new URL('../frontend', import.meta.url)),
    server: {
      host: '127.0.0.1',
      port: 5174,
      strictPort: true,
      proxy: { '/api/nomina': { target: 'http://127.0.0.1:3002', changeOrigin: true } },
    },
  });
  await vite.listen();
  console.log('Prueba aislada lista: http://127.0.0.1:5174/nomina');
  await stopped;
} finally {
  if (vite) await vite.close();
  if (server) await new Promise((resolve) => server.close(resolve));
  if (pool) await pool.close(2);
  if (c) await c.close();
  if (created) await admin.execute(`DROP USER ${user} CASCADE`);
  if (admin) await admin.close();
  console.log('Prueba aislada cerrada y esquema temporal eliminado.');
}
