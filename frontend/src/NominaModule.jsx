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
};
export function NominaModule(props) {
  return (
    <WorkspaceProvider>
      <NominaWorkspace {...props} />
    </WorkspaceProvider>
  );
}
function NominaWorkspace({
  apiBaseUrl,
  fetcher,
  basePath = import.meta.env.VITE_NOM_BASE_PATH || '/nomina',
  embedded = false,
}) {
  const workspace = useWorkspace();
  const api = useMemo(() => createApi(apiBaseUrl, fetcher), [apiBaseUrl, fetcher]);
  const resolve = () => ({
    slug: location.pathname.replace(/\/$/, '').slice(basePath.length + 1) || 'dashboard',
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
        tables={allForms}
        groups={allGroups}
        route={route}
        basePath={basePath}
        go={go}
        embedded={embedded}
      />
      <div className="main-shell">
        <main id="nomina-content" className="content">
          <div className="page-title">
            <h1>{table?.title || pages[route.slug] || 'Página no encontrada'}</h1>
            <p>
              <span>Nómina</span>
              <span aria-hidden="true">/</span>
              <span>{group?.label || 'Recursos Humanos'}</span>
            </p>
          </div>
          <div className="hr-workspace-context">
            <div>
              <label htmlFor="workspace-company">Empresa de trabajo</label>
              <ForeignKeySelect
                id="workspace-company"
                field={{ label: 'Empresa', ref: { table: 'ERP_EMPRESA' } }}
                value={workspace.company}
                onChange={workspace.setCompany}
                api={api}
              />
            </div>
            <p>
              {workspace.company
                ? 'Esta empresa se usa en listados vinculados y nuevas capturas. Los catálogos compartidos muestran todos los registros.'
                : 'Todas las empresas · selecciona una para enfocar el trabajo.'}
            </p>
            {workspace.drafts.size > 0 && (
              <span role="status">{workspace.drafts.size} borrador(es) en esta sesión</span>
            )}
          </div>
          {route.slug === 'revision' ? (
            <Suspense
              fallback={
                <p role="status" className="hr-card">
                  Cargando revisión…
                </p>
              }
            >
              <WorkflowPage key={route.search} api={api} go={go} />
            </Suspense>
          ) : table ? (
            <EntityPage
              key={route.slug + route.search + workspace.company}
              table={table}
              api={api}
              go={go}
            />
          ) : route.slug === 'dashboard' ? (
            <Dashboard api={api} go={go} />
          ) : route.slug === 'alta-empleado' ? (
            <HireEmployee key={route.search} api={api} go={go} />
          ) : route.slug === 'expediente' ? (
            <EmployeeFile key={route.search} api={api} go={go} />
          ) : route.slug === 'guia' ? (
            <UserGuide go={go} />
          ) : (
            <Button onClick={() => go('dashboard')}>Volver al inicio</Button>
          )}
        </main>
      </div>
      <Toaster richColors closeButton position="bottom-right" />
    </div>
  );
}
