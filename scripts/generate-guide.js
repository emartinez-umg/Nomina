import { writeFileSync } from 'node:fs';
import { guide } from '../shared/user-guide.js';
writeFileSync(
  new URL('../docs/guia-recursos-humanos.md', import.meta.url),
  '# Guía de Recursos Humanos\n\nGenerada desde `shared/user-guide.js`. Edita esa fuente para actualizar la guía y la ayuda de la aplicación.\n\n' +
    guide
      .map(
        (s) =>
          '## ' +
          s.title +
          '\n\n' +
          s.text +
          '\n\n' +
          s.actions.map(([route, label]) => '- ' + label + ': `/nomina/' + route + '`').join('\n'),
      )
      .join('\n\n')
      .trimEnd() +
    '\n',
);
