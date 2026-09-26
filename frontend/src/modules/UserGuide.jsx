import { BookOpen } from 'lucide-react';
import { guide } from '../../../shared/user-guide.js';
import { Button } from '../components/ui/button';
export function UserGuide({ go }) {
  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <section className="hr-hero">
        <div>
          <BookOpen size={30} />
          <h2>Guía de Recursos Humanos</h2>
          <p>Del registro de una persona al seguimiento de su nómina.</p>
        </div>
      </section>
      {guide.map((s) => (
        <section key={s.title} className="hr-card">
          <h2>{s.title}</h2>
          <p className="mt-3 leading-relaxed text-muted-foreground">{s.text}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {s.actions.map(([route, label]) => (
              <Button key={route} variant="outline" size="sm" onClick={() => go(route)}>
                {label}
              </Button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
