import { randomBytes } from 'node:crypto';
import { writeFileSync, existsSync, unlinkSync } from 'node:fs';
import oracledb from 'oracledb';
import { createUser } from '../../backend/src/services/auth.js';
import { executeOptions } from '../../backend/src/config/pool.js';
export async function bootstrapUser(c, output = '.nomina-admin-inicial.txt') {
  const existing = await c.execute(
    "SELECT u.USU_ID FROM ERP_USUARIO u JOIN ERP_USUARIO_ROL ur ON ur.USU_ID=u.USU_ID JOIN ERP_ROL r ON r.ROL_ID=ur.ROL_ID JOIN NOM_USUARIO_PERFIL p ON p.NUP_USUARIO=u.USU_ID WHERE r.ROL_NOMBRE='NOMINA_SISTEMA' AND u.USU_ACTIVO=1",
    {},
    executeOptions,
  );
  if (existing.rows.length) return false;
  if (existsSync(output))
    throw new Error(
      'Ya existe el archivo de acceso inicial. Consérvalo o muévelo antes de volver a crear el administrador.',
    );
  const company = await c.execute(
    'SELECT EMP_ID FROM ERP_EMPRESA WHERE EMP_ACTIVO=1 ORDER BY EMP_ID FETCH FIRST 1 ROW ONLY',
    {},
    executeOptions,
  );
  if (!company.rows.length)
    throw new Error(
      'Crea primero una empresa activa en el ERP para asignar al administrador inicial.',
    );
  const password = randomBytes(18).toString('base64url');
  let credentialFileCreated = false;
  try {
    const person = await c.execute(
      "INSERT INTO ERP_PERSONA(PER_TIPO,PER_NOMBRES,PER_APELLIDOS) VALUES('F','Administrador','Nómina') RETURNING PER_ID INTO :id",
      { id: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 80 } },
    );
    await createUser(c, {
      login: 'admin.nomina',
      password,
      personId: String(person.outBinds.id[0]),
      companyId: company.rows[0].EMP_ID,
      role: 'NOMINA_SISTEMA',
    });
    writeFileSync(
      output,
      `Usuario: admin.nomina\nContraseña temporal: ${password}\nDebes cambiarla al iniciar sesión. Elimina este archivo después de cambiarla.\n`,
      { mode: 0o600, flag: 'wx' },
    );
    credentialFileCreated = true;
    await c.commit();
    return true;
  } catch (e) {
    await c.rollback();
    if (credentialFileCreated) unlinkSync(output);
    throw e;
  }
}
