import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { createApi } from '../api/client';
import { roleLabels, roles } from '../../../shared/access.js';
import { Button } from '../components/ui/button';
const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);
export function AuthGate({ apiBaseUrl, fetcher, children }) {
  const api = useMemo(() => createApi(apiBaseUrl, fetcher), [apiBaseUrl, fetcher]);
  const [user, setUser] = useState(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState('');
  const [login, setLogin] = useState(''),
    [password, setPassword] = useState(''),
    [currentPassword, setCurrentPassword] = useState(''),
    [busy, setBusy] = useState(false);
  async function refresh() {
    setLoading(true);
    setError('');
    try {
      const data = await api('/auth/session');
      setUser(
        data.localMode
          ? {
              id: 'local',
              login: 'Modo de integración',
              localMode: true,
              memberships: [],
              role: roles.SYSTEM,
            }
          : data.user,
      );
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    refresh();
  }, [api]);
  useEffect(() => {
    const expired = () => {
      setUser(null);
      setError('Tu sesión terminó. Inicia sesión para volver a la pantalla donde estabas.');
    };
    window.addEventListener('nomina-session-expired', expired);
    return () => window.removeEventListener('nomina-session-expired', expired);
  }, []);
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const data = await api(user?.mustChangePassword ? '/auth/password' : '/auth/login', {
        method: 'POST',
        body: JSON.stringify(
          user?.mustChangePassword ? { currentPassword, password } : { login, password },
        ),
      });
      setUser(data);
      setPassword('');
      setCurrentPassword('');
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function logout() {
    await api('/auth/logout', { method: 'POST' });
    setUser(null);
  }
  if (loading)
    return (
      <div className="nomina-root p-10" role="status">
        Comprobando sesión…
      </div>
    );
  if (!user || user.mustChangePassword)
    return (
      <div className="nomina-root min-h-screen grid place-items-center p-5">
        <form className="hr-card w-full max-w-md space-y-4" onSubmit={submit}>
          <h1 className="text-2xl font-bold">
            {user ? 'Cambia tu contraseña temporal' : 'Ingresar a Nómina'}
          </h1>
          <p>
            {user
              ? 'Elige una contraseña personal de al menos 12 caracteres para continuar.'
              : 'Usa el usuario que te asignó el administrador.'}
          </p>
          {error && (
            <p className="notice" role="alert">
              {error}
            </p>
          )}
          {!user && (
            <label className="block">
              Usuario
              <input
                autoComplete="username"
                className="control w-full"
                required
                maxLength={80}
                value={login}
                onChange={(e) => setLogin(e.target.value)}
              />
            </label>
          )}
          {user && (
            <label className="block">
              Contraseña actual
              <input
                type="password"
                autoComplete="current-password"
                className="control w-full"
                required
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
              />
            </label>
          )}
          <label className="block">
            {user ? 'Nueva contraseña' : 'Contraseña'}
            <input
              type="password"
              autoComplete={user ? 'new-password' : 'current-password'}
              className="control w-full"
              required
              minLength={user ? 12 : undefined}
              maxLength={128}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={refresh}>
              Reintentar conexión
            </Button>
            <Button disabled={busy}>
              {busy ? 'Comprobando…' : user ? 'Guardar contraseña' : 'Ingresar'}
            </Button>
          </div>
        </form>
      </div>
    );
  return (
    <AuthContext.Provider value={{ user, setUser, logout, roleLabels }}>
      {children(user)}
    </AuthContext.Provider>
  );
}
