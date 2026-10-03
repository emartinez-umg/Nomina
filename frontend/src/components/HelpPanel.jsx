import { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthGate';
import { roles, canOpenPage } from '../../../shared/access.js';
import { helpFor } from '../../../shared/module-help.js';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from './ui/dialog';
export function HelpPanel({ slug, table, api, go, role, tables }) {
  const [open, setOpen] = useState(false),
    [error, setError] = useState('');
  const auth = useAuth();
  const help = helpFor(slug, table);
  async function tour(moduleOnly = false) {
    setOpen(false);
    setError('');
    try {
      const { driver } = await import('driver.js');
      await import('driver.js/dist/driver.css');
      const steps = moduleOnly
        ? [
            { element: '.page-title', popover: { title: help.title, description: help.purpose } },
            {
              element: '#nomina-content',
              popover: { title: 'Antes de empezar', description: help.requires },
            },
            {
              element: '[data-help-trigger]',
              popover: { title: 'Ayuda disponible', description: help.problem },
            },
          ]
        : [
            {
              element: '.workspace-header',
              popover: {
                title: 'Bienvenido a Nómina',
                description: 'El menú muestra las secciones disponibles para tu rol.',
              },
            },
            {
              element: '.command-trigger',
              popover: {
                title: 'Encuentra lo que necesitas',
                description: 'Escribe un módulo o una acción. También puedes usar Ctrl+K o ⌘K.',
              },
            },
            {
              element: '#workspace-company',
              popover: {
                title: 'Tu empresa de trabajo',
                description: 'Los datos y permisos se ajustan a la empresa seleccionada.',
              },
            },
            {
              element: '[data-tour="profile"]',
              popover: {
                title: 'Tu sesión',
                description: 'Aquí ves tu usuario y rol, y puedes cerrar la sesión.',
              },
            },
            {
              element: '#nomina-content',
              popover: {
                title: role === roles.EMPLOYEE ? 'Tu información' : 'Trabajo diario',
                description:
                  role === roles.EMPLOYEE
                    ? 'Consulta tus boletas, calendario y recomendaciones.'
                    : 'Revisa los pendientes antes de calcular o registrar los pagos.',
              },
            },
            {
              element: '[data-help-trigger]',
              popover: {
                title: 'Ayuda en cada sección',
                description: 'Abre este panel cuando tengas una duda. Puedes repetir el recorrido.',
              },
            },
          ];
      driver({
        showProgress: true,
        nextBtnText: 'Siguiente',
        prevBtnText: 'Anterior',
        doneBtnText: 'Terminar',
        allowClose: true,
        steps,
        onDestroyed: () => {
          if (!auth.user.localMode && !moduleOnly)
            api('/perfil/recorrido', { method: 'POST' })
              .then(() => auth.setUser((u) => ({ ...u, tourSeen: true })))
              .catch((e) => setError(e.message));
        },
      }).drive();
    } catch (e) {
      setError('No se pudo abrir el recorrido. ' + e.message);
    }
  }
  useEffect(() => {
    if (!auth.user.localMode && !auth.user.tourSeen) {
      const timer = setTimeout(() => tour(), 700);
      return () => clearTimeout(timer);
    }
  }, [auth.user.id]);
  return (
    <div className="mb-4 flex justify-end">
      <Button data-help-trigger variant="outline" onClick={() => setOpen(true)}>
        Ayuda
      </Button>
      {error && <p role="alert">{error}</p>}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="max-w-xl p-6"
          style={{
            left: 'auto',
            right: 0,
            top: 0,
            transform: 'none',
            height: '100dvh',
            maxHeight: '100dvh',
          }}
        >
          <DialogTitle>Ayuda · {help.title}</DialogTitle>
          <DialogDescription>{help.purpose}</DialogDescription>
          <div className="space-y-4 overflow-y-auto">
            <h3>Antes de empezar</h3>
            <p>{help.requires}</p>
            <h3>Cómo se usa</h3>
            <p>{help.steps}</p>
            <h3>Si algo no funciona</h3>
            <p>{help.problem}</p>
            <div className="flex flex-wrap gap-2">
              {help.links
                .filter(([route]) => canOpenPage(role, route, tables))
                .map(([route, label]) => (
                  <Button
                    key={route}
                    variant="outline"
                    onClick={() => {
                      setOpen(false);
                      go(route);
                    }}
                  >
                    {label}
                  </Button>
                ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => tour(true)}>Recorrer esta sección</Button>
              <Button variant="outline" onClick={() => tour()}>
                Repetir bienvenida
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
