import { HelpPanel } from './components/HelpPanel';
import {
  MyInformation,
  StaffCalendar,
  Recommendations,
  UserAdministration,
  ClosingNotices,
} from './modules/PersonalPortal';
import { AuthGate, useAuth } from './auth/AuthGate';
import { canOpenPage, canUseTable, roles } from '../../shared/access.js';
import { ResumeWork } from './components/ResumeWork';
import { useEffect, useMemo, useState, lazy, Suspense } from 'react';
import { Toaster } from 'sonner';
import schema from '../../shared/schema.json';
import { masterGroups } from '../../shared/hr-catalog.js';
import { Dashboard } from './modules/Dashboard';
import { HireEmployee } from './modules/HireEmployee';
import { EmployeeFile } from './modules/EmployeeFile';
import { UserGuide } from './modules/UserGuide';
import { groups } from '../../shared/catalog.js';
import { createApi } from './api/client';
import { EntityPage } from './modules/EntityPage';
import { Button } from './components/ui/button';
import { TopNavigation } from './components/TopNavigation';
import './styles.css';
import { WorkspaceProvider, useWorkspace } from './state/WorkspaceContext';
import { ForeignKeySelect } from './components/ForeignKeySelect';
const WorkflowPage = lazy(() =>
  import('./modules/WorkflowPage').then((m) => ({ default: m.WorkflowPage })),
);
const allForms = [...schema.tables, ...schema.masters];
const allGroups = [...groups, ...masterGroups];
const pages = {
  dashboard: 'Inicio',
  'alta-empleado': 'Contratar empleado',
  expediente: 'Expediente del empleado',
  guia: 'Guía de uso',
  revision: 'Revisión y seguimiento',
  'mi-informacion': 'Mi información',
  calendario: 'Calendario',
  recomendaciones: 'Recomendaciones',
  usuarios: 'Usuarios y roles',
};
export function NominaModule(props) {
  return (
    <AuthGate apiBaseUrl={props.apiBaseUrl} fetcher={props.fetcher}>
      {(user) => (
        <WorkspaceProvider key={user.id} scope={user.id}>
          <NominaWorkspace {...props} />
        </WorkspaceProvider>
      )}
    </AuthGate>
  );
}
function NominaWorkspace({
  apiBaseUrl,
  fetcher,
  basePath = import.meta.env.VITE_NOM_BASE_PATH || '/nomina',
  embedded = false,
}) {
  const workspace = useWorkspace();
  const auth = useAuth();
  const membership =
    auth.user.memberships?.find(
      (m) => m.companyId === workspace.company && m.role === roles.SYSTEM,
    ) ||
    auth.user.memberships?.find(
      (m) => m.companyId === workspace.company && m.role === roles.PAYROLL,
    ) ||
    auth.user.memberships?.find((m) => m.companyId === workspace.company) ||
    auth.user.memberships?.[0];
  const role = membership?.role || auth.user.role;
  const company = membership?.companyId || workspace.company;
  const allowedForms = allForms.filter((t) => canUseTable(role, t));
  useEffect(() => {
    if (membership && workspace.company !== membership.companyId)
      workspace.setCompany(membership.companyId);
  }, [membership?.companyId, workspace.company]);
  const api = useMemo(
    () => createApi(apiBaseUrl, fetcher, company ? { 'X-Nomina-Company': company } : {}),
    [apiBaseUrl, fetcher, company],
  );
  const resolve = () => ({
    slug:
      location.pathname.replace(/\/$/, '').slice(basePath.length + 1) ||
      (role === roles.EMPLOYEE ? 'mi-informacion' : 'dashboard'),
    search: location.search,
  });
  const [route, setRoute] = useState(resolve);
  const table = allForms.find((t) => t.slug === route.slug),
    group = allGroups.find((g) => g.id === table?.group);
  useEffect(() => {
    const sync = () => setRoute(resolve());
    window.addEventListener('popstate', sync);
    return () => window.removeEventListener('popstate', sync);
  }, [basePath]);
  function go(slug, params = {}) {
    if (params.company) workspace.setCompany(params.company);
    const clean = { ...params };
    delete clean.company;
    const search = new URLSearchParams(clean).toString();
    history.pushState({}, '', `${basePath}/${slug}${search ? '?' + search : ''}`);
    setRoute(resolve());
    window.scrollTo({ top: 0, behavior: 'instant' });
  }
  return (
    <div className={`nomina-root ${embedded ? 'embedded' : ''}`}>
      <a href="#nomina-content" className="skip-link">
        Saltar al contenido
      </a>
      <TopNavigation
        tables={allowedForms}
        role={role}
        groups={allGroups}
        route={route}
        basePath={basePath}
        go={go}
        embedded={embedded}
      />
      <div className="main-shell">
        <main id="nomina-content" className="content">
          <div
            className="mb-4 flex flex-wrap items-center justify-between gap-3"
            data-tour="profile"
          >
            <span>
              {auth.user.login} · {auth.roleLabels[role]}
            </span>
            {!auth.user.localMode && (
              <Button
                variant="outline"
                onClick={() => auth.logout().catch((e) => window.alert(e.message))}
              >
                Cerrar sesión
              </Button>
            )}
          </div>
          <div className="page-title">
            <h1>{table?.title || pages[route.slug] || 'Página no encontrada'}</h1>
            <p>
              <button
                className="underline"
                onClick={() => go(role === roles.EMPLOYEE ? 'mi-informacion' : 'dashboard')}
              >
                Nómina
              </button>
              <span aria-hidden="true">/</span>
              <button className="underline" onClick={() => go('guia')}>
                {group?.label || 'Recursos Humanos'}
              </button>
            </p>
          </div>
          <div className="hr-workspace-context">
            <div>
              <label htmlFor="workspace-company">Empresa de trabajo</label>
              {!auth.user.localMode ? (
                <select
                  id="workspace-company"
                  className="control w-full"
                  value={company}
                  onChange={(e) => workspace.setCompany(e.target.value)}
                >
                  {[...new Map(auth.user.memberships.map((m) => [m.companyId, m])).values()].map(
                    (m) => (
                      <option key={m.companyId} value={m.companyId}>
                        {m.companyName}
                      </option>
                    ),
                  )}
                </select>
              ) : (
                <ForeignKeySelect
                  id="workspace-company"
                  field={{ label: 'Empresa', ref: { table: 'ERP_EMPRESA' } }}
                  value={workspace.company}
                  onChange={workspace.setCompany}
                  api={api}
                />
              )}
            </div>
            <p>
              {workspace.company
                ? 'Esta empresa se usa en listados vinculados y nuevas capturas. Los catálogos compartidos muestran todos los registros.'
                : 'Todas las empresas · selecciona una para enfocar el trabajo.'}
            </p>
            {workspace.drafts.size > 0 && (
              <span role="status">{workspace.drafts.size} borrador(es) en este navegador</span>
            )}
          </div>
          <HelpPanel
            slug={route.slug}
            table={table}
            api={api}
            go={go}
            role={role}
            tables={allForms}
          />
          <ResumeWork go={go} />
          {!auth.user.localMode && role !== roles.EMPLOYEE && <ClosingNotices api={api} go={go} />}
          {!canOpenPage(role, route.slug, allForms) ? (
            <section className="hr-card">
              <h2>Esta sección no está disponible para tu rol</h2>
              <Button onClick={() => go(role === roles.EMPLOYEE ? 'mi-informacion' : 'dashboard')}>
                Volver a mi inicio
              </Button>
            </section>
          ) : route.slug === 'revision' ? (
            <Suspense
              fallback={
                <p role="status" className="hr-card">
                  Cargando revisión…
                </p>
              }
            >
              <WorkflowPage key={route.search + company} api={api} go={go} />
            </Suspense>
          ) : table ? (
            <EntityPage
              key={route.slug + route.search + workspace.company}
              table={table}
              readOnly={!canUseTable(role, table, true)}
              api={api}
              go={go}
            />
          ) : route.slug === 'mi-informacion' ? (
            <MyInformation api={api} />
          ) : route.slug === 'calendario' ? (
            <StaffCalendar key={company} api={api} go={go} role={role} />
          ) : route.slug === 'recomendaciones' ? (
            <Recommendations key={company} api={api} go={go} role={role} />
          ) : route.slug === 'usuarios' ? (
            <UserAdministration key={company} api={api} />
          ) : route.slug === 'dashboard' ? (
            <Dashboard api={api} go={go} />
          ) : route.slug === 'alta-empleado' ? (
            <HireEmployee key={route.search + company} api={api} go={go} />
          ) : route.slug === 'expediente' ? (
            <EmployeeFile key={route.search + company} api={api} go={go} />
          ) : route.slug === 'guia' ? (
            <UserGuide go={go} />
          ) : (
            <Button onClick={() => go(role === roles.EMPLOYEE ? 'mi-informacion' : 'dashboard')}>
              Volver al inicio
            </Button>
          )}
        </main>
      </div>
      <Toaster richColors closeButton position="bottom-right" />
    </div>
  );
}
