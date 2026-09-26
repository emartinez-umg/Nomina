import { installWorkflow } from '../backend/src/services/workflow-schema.js';
// --check rehearses in a disposable schema. --install installs the requested ERP
// in ERP_NOMINA and switches this project's connection only after validation.
// The original NOMINA schema is never changed or removed.
import oracledb from 'oracledb';
import { loadEnvFile } from 'node:process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { inspectSchema, schemaDdl } from './lib/introspect.js';
import { parseScript } from './lib/sql-script.js';
import {
  snapshotSchema,
  transformLegacy,
  insertRows,
  seedCatalogs,
  validateInstalled,
} from './lib/migration-data.js';
loadEnvFile('.env');
const installing = process.argv.includes('--install');
const name = installing ? 'ERP_NOMINA' : 'NOM_MIG_TEST_' + Date.now();
const password = installing ? process.env.NOM_DB_PASSWORD : 'Test' + Date.now() + 'Migration';
if (!/^[A-Za-z][A-Za-z0-9_#]{11,63}$/.test(password))
  throw Error('La contraseña de instalación no cumple el formato del inicializador.');
const connectString = process.env.NOM_DB_CONNECT_STRING;
const source = await oracledb.getConnection({
  user: process.env.NOM_DB_USER,
  password: process.env.NOM_DB_PASSWORD,
  connectString,
});
let admin,
  c,
  created = false,
  activated = false;
try {
  const sourceModel = await inspectSchema(source);
  const allowedExternal = new Set([
    'ERP_EMPRESA',
    'ERP_PERSONA',
    'ERP_USUARIO',
    'ERP_SUCURSAL',
    'ERP_DEPARTAMENTO',
    'ERP_BANCO',
    'CXC_DTE',
  ]);
  if (sourceModel.some((t) => !t.name.startsWith('NOM_') && !allowedExternal.has(t.name)))
    throw Error('El esquema contiene datos fuera del alcance del adaptador de Nómina.');
  if (
    !sourceModel
      .find((t) => t.name === 'NOM_EMPLEADO')
      ?.columns.some((f) => f.name === 'EML_SALARIO')
  )
    throw Error('Este adaptador requiere el esquema antiguo. No se modificó ninguna tabla.');
  await source.execute('SET TRANSACTION READ ONLY');
  const snapshot = await snapshotSchema(source, sourceModel);
  await source.rollback();
  const data = transformLegacy(snapshot);
  const stamp = new Date().toISOString().replaceAll(':', '-'),
    backup = `backups/${stamp}-pre-erp`;
  mkdirSync(backup, { recursive: true, mode: 0o700 });
  writeFileSync(`${backup}/esquema.sql`, schemaDdl(sourceModel), { mode: 0o600 });
  writeFileSync(
    `${backup}/manifest.json`,
    JSON.stringify(
      {
        sourceUser: process.env.NOM_DB_USER,
        dataBackup: 'El esquema de origen se conserva intacto; no se exportan filas a disco.',
        createdAt: stamp,
        counts: Object.fromEntries(Object.entries(snapshot).map(([t, r]) => [t, r.length])),
        sha256: createHash('sha256').update(JSON.stringify(snapshot)).digest('hex'),
      },
      null,
      2,
    ) + '\n',
    { mode: 0o600 },
  );
  admin = await oracledb.getConnection({
    user: 'SYSTEM',
    password: process.env.ORACLE_PWD,
    connectString,
  });
  const existing = (
    await admin.execute('SELECT USERNAME FROM ALL_USERS WHERE USERNAME=:name', { name })
  ).rows;
  if (existing.length) throw Error(`El esquema ${name} ya existe; no se sobrescribe.`);
  await admin.execute(
    `CREATE USER ${name} IDENTIFIED BY "${password}" DEFAULT TABLESPACE USERS QUOTA UNLIMITED ON USERS`,
  );
  created = true;
  await admin.execute(`GRANT CREATE SESSION,CREATE TABLE,CREATE SEQUENCE,CREATE VIEW TO ${name}`);
  c = await oracledb.getConnection({ user: name, password, connectString });
  await c.execute("ALTER SESSION SET NLS_NUMERIC_CHARACTERS='.,'");
  for (const { sql } of parseScript(readFileSync('db/ERP_ESQUEMA_FINAL.sql', 'utf8')))
    await c.execute(sql);
  await insertRows(c, data);
  await seedCatalogs(c);
  await installWorkflow(c);
  const result = await validateInstalled(c, data);
  // Detect writes during installation before switching; the old schema stays authoritative.
  await source.execute('SET TRANSACTION READ ONLY');
  const latest = await snapshotSchema(source, sourceModel);
  await source.rollback();
  if (JSON.stringify(latest) !== JSON.stringify(snapshot))
    throw Error(
      'El origen cambió durante la migración. No se cambia la conexión; vuelve a ensayar sin escrituras concurrentes.',
    );
  const report = {
    ...result,
    mode: installing ? 'installed' : 'rehearsal',
    backup,
    sourceUser: process.env.NOM_DB_USER,
    targetUser: installing ? name : 'temporal eliminado',
    migratedSourceRows: Object.values(snapshot).reduce((n, r) => n + r.length, 0),
    notes: [
      'Salario ordinario conserva EML_SALARIO; bonificación de los datos de demostración = 0.',
      'Se creó la relación laboral del empleado de ejemplo con su puesto, sucursal y fecha de ingreso originales.',
      'Los datos fiscales y de ubicación añadidos son marcadores de desarrollo, no información real.',
    ],
  };
  if (installing) {
    const env = readFileSync('.env', 'utf8')
      .replace(/^NOM_DB_USER=.*$/m, 'NOM_DB_USER=' + name)
      .replace(/^NOM_EXTERNAL_MODE=.*$/m, 'NOM_EXTERNAL_MODE=erp');
    writeFileSync('.env', env, { mode: 0o600 });
    activated = true;
    writeFileSync('db/migrations/2026-09-11-result.json', JSON.stringify(report, null, 2) + '\n');
  }
  console.log(JSON.stringify(report, null, 2));
} finally {
  if (c) await c.close();
  if (created && !activated && admin) await admin.execute(`DROP USER ${name} CASCADE`);
  if (admin) await admin.close();
  await source.close();
}
