import oracledb from 'oracledb';
export async function createPool(env = process.env) {
  if (!env.NOM_DB_USER || !env.NOM_DB_PASSWORD || !env.NOM_DB_CONNECT_STRING)
    throw new Error('Configura NOM_DB_USER, NOM_DB_PASSWORD y NOM_DB_CONNECT_STRING en .env.');
  return oracledb.createPool({
    user: env.NOM_DB_USER,
    password: env.NOM_DB_PASSWORD,
    connectString: env.NOM_DB_CONNECT_STRING,
    poolMin: Number(env.NOM_DB_POOL_MIN || 1),
    poolMax: Number(env.NOM_DB_POOL_MAX || 5),
    poolIncrement: 1,
    queueTimeout: 10000,
    sessionCallback: (connection, _tag, done) => {
      connection
        .execute("ALTER SESSION SET NLS_NUMERIC_CHARACTERS = '.,'")
        .then(() => done(), done);
    },
  });
}
export const executeOptions = {
  outFormat: oracledb.OUT_FORMAT_OBJECT,
  fetchTypeHandler: (meta) =>
    meta.dbType === oracledb.DB_TYPE_NUMBER ? { type: oracledb.STRING } : undefined,
};
