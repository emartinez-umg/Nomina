import { scrypt as scryptCallback, randomBytes, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import oracledb from 'oracledb';
import { Router } from 'express';
import { ApiError } from '../repositories/repository.js';
import { executeOptions } from '../config/pool.js';
import { roles, roleLabels } from '../../../shared/access.js';
const scrypt = promisify(scryptCallback);
const hashToken = (token) => createHash('sha256').update(token).digest('hex');
const cookieName = 'nomina_session';
export async function passwordHash(password) {
  if (typeof password !== 'string' || password.length < 12 || password.length > 128)
    throw new ApiError(422, 'La contraseña debe tener entre 12 y 128 caracteres.', {
      password: 'Usa entre 12 y 128 caracteres.',
    });
  const salt = randomBytes(16).toString('hex');
  const key = await scrypt(password, salt, 64);
  return `scrypt:${salt}:${key.toString('hex')}`;
}
export async function verifyPassword(password, encoded) {
  if (
    typeof password !== 'string' ||
    password.length > 128 ||
    !/^scrypt:[a-f0-9]{32}:[a-f0-9]{128}$/.test(encoded || '')
  )
    return false;
  const [, salt, hash] = encoded.split(':');
  return timingSafeEqual(Buffer.from(hash, 'hex'), await scrypt(password, salt, 64));
}
const query = async (c, sql, binds = {}) => (await c.execute(sql, binds, executeOptions)).rows;
export async function userProfile(c, id) {
  const [user] = await query(
    c,
    `SELECT u.USU_ID AS "id",u.USU_LOGIN AS "login",u.PER_ID AS "personId",p.NUP_CAMBIO AS "mustChangePassword",p.NUP_TOUR AS "tourSeen" FROM ERP_USUARIO u JOIN NOM_USUARIO_PERFIL p ON p.NUP_USUARIO=u.USU_ID WHERE u.USU_ID=TO_NUMBER(:id) AND u.USU_ACTIVO=1`,
    { id },
  );
  if (!user) return null;
  user.memberships = await query(
    c,
    `SELECT ur.EMP_ID AS "companyId",r.ROL_NOMBRE AS "role",e.EMP_RAZON_SOCIAL AS "companyName" FROM ERP_USUARIO_ROL ur JOIN ERP_ROL r ON r.ROL_ID=ur.ROL_ID JOIN ERP_EMPRESA e ON e.EMP_ID=ur.EMP_ID WHERE ur.USU_ID=TO_NUMBER(:id) AND r.ROL_ACTIVO=1 AND e.EMP_ACTIVO=1 AND r.ROL_NOMBRE IN ('NOMINA_SISTEMA','NOMINA_ADMIN','NOMINA_COLABORADOR') ORDER BY ur.EMP_ID`,
    { id },
  );
  user.mustChangePassword = user.mustChangePassword === '1';
  user.tourSeen = user.tourSeen === '1';
  return user;
}
export function authService(pool, { secure = process.env.NODE_ENV === 'production' } = {}) {
  async function connection(work, write = false) {
    const c = await pool.getConnection();
    try {
      const result = await work(c);
      if (write) await c.commit();
      return result;
    } catch (e) {
      if (write) await c.rollback();
      throw e;
    } finally {
      await c.close();
    }
  }
  const tokenFrom = (req) =>
    String(req.headers.cookie || '')
      .split(';')
      .map((s) => s.trim())
      .find((s) => s.startsWith(cookieName + '='))
      ?.slice(cookieName.length + 1);
  const cookie = (res, token, maxAge = 8 * 3600000) =>
    res.cookie(cookieName, token, {
      httpOnly: true,
      secure,
      sameSite: 'strict',
      path: '/',
      maxAge,
    });
  const router = Router();
  // A custom header prevents form/image CSRF; CORS restricts cross-origin preflight.
  router.use((req, _res, next) => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.get('X-Nomina-Request') !== '1')
      throw new ApiError(403, 'Solicitud no autorizada.', {}, 'CSRF_REJECTED');
    next();
  });
  const attempts = new Map();
  router.post('/login', async (req, res) => {
    const key = req.ip;
    const now = Date.now();
    for (const [k, v] of attempts) if (v.until < now) attempts.delete(k);
    const attempt = attempts.get(key) || { count: 0, until: now + 15 * 60000 };
    if (++attempt.count > 10)
      throw new ApiError(429, 'Demasiados intentos. Espera 15 minutos antes de intentar otra vez.');
    attempts.set(key, attempt);
    const login = String(req.body?.login || '').trim();
    if (!login || login.length > 80) throw new ApiError(401, 'Usuario o contraseña incorrectos.');
    const result = await connection(async (c) => {
      const [row] = await query(
        c,
        'SELECT USU_ID,USU_PASSWORD_HASH FROM ERP_USUARIO WHERE USU_LOGIN=:login AND USU_ACTIVO=1',
        { login },
      );
      if (!row || !(await verifyPassword(req.body?.password, row.USU_PASSWORD_HASH)))
        throw new ApiError(401, 'Usuario o contraseña incorrectos.');
      const user = await userProfile(c, row.USU_ID);
      if (!user?.memberships.length)
        throw new ApiError(
          403,
          'El usuario no tiene acceso a Nómina. Solicita una asignación de empresa y rol.',
        );
      const token = randomBytes(32).toString('hex');
      await c.execute('DELETE FROM NOM_SESION WHERE NSN_VENCE<SYSTIMESTAMP');
      await c.execute(
        "INSERT INTO NOM_SESION(NSN_TOKEN,NSN_USUARIO,NSN_VENCE) VALUES (:token,TO_NUMBER(:id),SYSTIMESTAMP+INTERVAL '8' HOUR)",
        { token: hashToken(token), id: user.id },
      );
      return { user, token };
    }, true);
    attempts.delete(key);
    cookie(res, result.token);
    res.json(result.user);
  });
  async function identify(req) {
    const token = tokenFrom(req);
    if (!/^[a-f0-9]{64}$/.test(token || '')) return null;
    return connection(async (c) => {
      const [session] = await query(
        c,
        'SELECT NSN_USUARIO FROM NOM_SESION WHERE NSN_TOKEN=:token AND NSN_VENCE>SYSTIMESTAMP',
        { token: hashToken(token) },
      );
      return session ? userProfile(c, session.NSN_USUARIO) : null;
    });
  }
  router.get('/session', async (req, res) => res.json({ user: await identify(req) }));
  router.post('/logout', async (req, res) => {
    const token = tokenFrom(req);
    if (token)
      await connection(
        (c) =>
          c.execute('DELETE FROM NOM_SESION WHERE NSN_TOKEN=:token', { token: hashToken(token) }),
        true,
      );
    cookie(res, '', 0);
    res.status(204).end();
  });
  router.post('/password', async (req, res) => {
    const user = await identify(req);
    if (!user) throw new ApiError(401, 'Inicia sesión para continuar.', {}, 'LOGIN_REQUIRED');
    const hash = await passwordHash(req.body?.password);
    await connection(async (c) => {
      const [old] = await query(
        c,
        'SELECT USU_PASSWORD_HASH FROM ERP_USUARIO WHERE USU_ID=TO_NUMBER(:id) FOR UPDATE',
        { id: user.id },
      );
      if (!(await verifyPassword(req.body?.currentPassword, old.USU_PASSWORD_HASH)))
        throw new ApiError(422, 'La contraseña actual no coincide.');
      if (await verifyPassword(req.body?.password, old.USU_PASSWORD_HASH))
        throw new ApiError(422, 'Elige una contraseña distinta a la temporal.');
      await c.execute(
        'UPDATE ERP_USUARIO SET USU_PASSWORD_HASH=:hash WHERE USU_ID=TO_NUMBER(:id)',
        { hash, id: user.id },
      );
      await c.execute(
        'UPDATE NOM_USUARIO_PERFIL SET NUP_CAMBIO=0 WHERE NUP_USUARIO=TO_NUMBER(:id)',
        { id: user.id },
      );
      await c.execute(
        'DELETE FROM NOM_SESION WHERE NSN_USUARIO=TO_NUMBER(:id) AND NSN_TOKEN<>:token',
        { id: user.id, token: hashToken(tokenFrom(req)) },
      );
    }, true);
    res.json({ ...user, mustChangePassword: false });
  });
  async function requireSession(req, _res, next) {
    const user = await identify(req);
    if (!user?.memberships.length)
      throw new ApiError(
        401,
        'Tu sesión terminó. Inicia sesión para continuar.',
        {},
        'LOGIN_REQUIRED',
      );
    if (user.mustChangePassword)
      throw new ApiError(
        403,
        'Cambia tu contraseña temporal antes de continuar.',
        {},
        'PASSWORD_CHANGE_REQUIRED',
      );
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.get('X-Nomina-Request') !== '1')
      throw new ApiError(403, 'Solicitud no autorizada.', {}, 'CSRF_REJECTED');
    const company = req.get('X-Nomina-Company') || user.memberships[0].companyId;
    const membership =
      user.memberships.find((m) => m.companyId === company && m.role === roles.SYSTEM) ||
      user.memberships.find((m) => m.companyId === company && m.role === roles.PAYROLL) ||
      user.memberships.find((m) => m.companyId === company);
    if (!membership) throw new ApiError(403, 'No tienes acceso a esta empresa.');
    req.nominaActor = {
      ...user,
      ...membership,
      label: user.login + ' · ' + user.id,
      verified: true,
    };
    next();
  }
  return { router, requireSession, connection };
}
export async function createUser(c, input) {
  const { login, password, personId, companyId, role } = input || {};
  if (
    !/^[a-zA-Z0-9._@-]{3,80}$/.test(login || '') ||
    !/^\d{1,38}$/.test(String(personId)) ||
    !/^\d{1,38}$/.test(String(companyId)) ||
    !roleLabels[role]
  )
    throw new ApiError(422, 'Completa usuario, persona, empresa y rol válidos.');
  const hash = await passwordHash(password);
  const [r] = await query(c, 'SELECT ROL_ID FROM ERP_ROL WHERE ROL_NOMBRE=:role AND ROL_ACTIVO=1', {
    role,
  });
  if (!r) throw new ApiError(503, 'Instala la actualización de Nómina para crear usuarios.');
  const result = await c.execute(
    'INSERT INTO ERP_USUARIO (PER_ID,USU_LOGIN,USU_PASSWORD_HASH) VALUES (TO_NUMBER(:personId),:login,:hash) RETURNING USU_ID INTO :id',
    {
      personId: String(personId),
      login,
      hash,
      id: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 80 },
    },
  );
  const id = String(result.outBinds.id[0]);
  await c.execute('INSERT INTO NOM_USUARIO_PERFIL(NUP_USUARIO) VALUES (TO_NUMBER(:id))', { id });
  await c.execute(
    'INSERT INTO ERP_USUARIO_ROL(USU_ID,ROL_ID,EMP_ID) VALUES (TO_NUMBER(:id),TO_NUMBER(:role),TO_NUMBER(:company))',
    { id, role: r.ROL_ID, company: String(companyId) },
  );
  return userProfile(c, id);
}
