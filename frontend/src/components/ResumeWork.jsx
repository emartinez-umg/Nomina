import { useState } from 'react';
import { useWorkspace } from '../state/WorkspaceContext';
import { Button } from './ui/button';
export function ResumeWork({ go }) {
  const workspace = useWorkspace();
  const [initial] = useState(() => [...workspace.drafts.entries()].filter(([, d]) => d.route));
  const [visible, setVisible] = useState(true);
  if (!visible || !initial.length) return null;
  return (
    <section className="hr-card mb-5" aria-label="Trabajo pendiente">
      <h2>¿Quieres continuar donde lo dejaste?</h2>
      <p>Hay borradores guardados en este navegador. Se eliminan después de 15 días sin cambios.</p>
      <div className="my-3 flex flex-wrap gap-2">
        {initial.map(([key, draft]) => (
          <Button
            key={key}
            variant="outline"
            onClick={() => {
              go(
                draft.route,
                draft.recordId
                  ? {
                      registro: draft.recordId,
                      editar: '1',
                      company: draft.company || workspace.company,
                    }
                  : {
                      company: draft.company || workspace.company,
                      ...(draft.params || {}),
                      ...(draft.initialValues || {}),
                      ...(draft.route === 'alta-empleado' ? {} : { nuevo: '1' }),
                    },
              );
              setVisible(false);
            }}
          >
            Continuar: {draft.label || draft.route}
          </Button>
        ))}
      </div>
      <Button variant="ghost" onClick={() => setVisible(false)}>
        Ahora no
      </Button>
      <Button
        variant="ghost"
        onClick={() => {
          if (window.confirm('¿Descartar los borradores recuperados y empezar de nuevo?')) {
            initial.forEach(([key]) => workspace.clearDraft(key));
            setVisible(false);
          }
        }}
      >
        Empezar de nuevo
      </Button>
    </section>
  );
}
