import oracledb from 'oracledb';
import { loadEnvFile } from 'node:process';
import { readFileSync, writeFileSync } from 'node:fs';
import { inspectSchema, schemaDdl } from './lib/introspect.js';
import { parseScript } from './lib/sql-script.js';
loadEnvFile('.env');
const user = 'ERP_CHECK_' + Date.now(),
  password = 'Test' + Date.now() + 'Safe';
const admin = await oracledb.getConnection({
  user: 'SYSTEM',
  password: process.env.ORACLE_PWD,
  connectString: process.env.NOM_DB_CONNECT_STRING,
});
let c,
  created = false;
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
  const statements = parseScript(readFileSync('db/ERP_MAS_NOMINA_CORREGIDO.sql', 'utf8'));
  for (const { line, sql } of statements)
    try {
      await c.execute(sql);
    } catch (e) {
      throw new Error(`Error en la línea ${line}: ${e.message}`, { cause: e });
    }
  const model = await inspectSchema(c);
  if (model.length !== 194 || model.filter((t) => t.name.startsWith('NOM_')).length !== 35)
    throw Error('Cobertura incompleta');
  writeFileSync('db/schema-erp.json', JSON.stringify(model, null, 2) + '\n');
  writeFileSync('db/ERP_ESQUEMA_FINAL.sql', schemaDdl(model));
  console.log(
    `ERP verificado: ${model.length} tablas, ${statements.length} sentencias sin errores. Esquema de ensayo eliminado al terminar.`,
  );
} finally {
  if (c) await c.close();
  if (created) await admin.execute(`DROP USER ${user} CASCADE`);
  await admin.close();
}
