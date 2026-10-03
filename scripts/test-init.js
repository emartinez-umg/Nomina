import oracledb from 'oracledb';
import { loadEnvFile } from 'node:process';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { parseScript } from './lib/sql-script.js';
import { validateInstalled } from './lib/migration-data.js';
loadEnvFile('.env');
const user = 'ERP_INIT_TEST_' + Date.now(),
  password = 'Test' + Date.now() + 'Safe',
  connectString = process.env.NOM_DB_CONNECT_STRING;
const admin = await oracledb.getConnection({
  user: 'SYSTEM',
  password: process.env.ORACLE_PWD,
  connectString,
});
let c,
  created = false;
try {
  await admin.execute(
    `CREATE USER ${user} IDENTIFIED BY "${password}" DEFAULT TABLESPACE USERS QUOTA UNLIMITED ON USERS`,
  );
  created = true;
  await admin.execute(`GRANT CREATE SESSION,CREATE TABLE,CREATE SEQUENCE TO ${user}`);
  c = await oracledb.getConnection({ user, password, connectString });
  for (const file of [
    'ERP_ESQUEMA_FINAL.sql',
    'RH_SEGUIMIENTO.sql',
    'seed.sql',
    'ERP_CATALOGOS.sql',
    'ERP_CATALOGOS.sql',
  ])
    for (const { sql } of parseScript(readFileSync('db/' + file, 'utf8'))) await c.execute(sql);
  await validateInstalled(c);
  assert.equal((await c.execute('SELECT COUNT(*) FROM NOM_EMPLEADO')).rows[0][0], 1);
  assert.equal((await c.execute('SELECT COUNT(*) FROM NOM_PARAMETRO_LABORAL')).rows[0][0], 2);
  await c.execute(
    "INSERT INTO CON_CUENTA_CONTABLE (EMP_ID,CCO_CODIGO,CCO_NOMBRE,CCO_TIPO,CCO_NIVEL,CCO_ACEPTA_MOVIMIENTO,CCO_NATURALEZA) VALUES (1,'TEST-H','Pasivo de ensayo','PASIVO',1,1,'H')",
  );
  console.log(
    'OK: instalación limpia de 194 tablas ERP y 9 tablas complementarias, semillas SQL UTF-8, catálogos idempotentes y naturaleza contable H.',
  );
} finally {
  if (c) await c.close();
  if (created) await admin.execute(`DROP USER ${user} CASCADE`);
  await admin.close();
}
