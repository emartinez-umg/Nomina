export const primaryPages = [
  { slug: 'dashboard', title: 'Inicio', group: 'general', keywords: 'resumen dashboard' },
  { slug: 'alta-empleado', title: 'Contratar empleado', group: 'general', keywords: 'alta nuevo' },
  { slug: 'guia', title: 'Guía de uso', group: 'general', keywords: 'ayuda instrucciones' },
];

export const navigationMenus = [
  { id: 'personal', title: 'Personal', groups: ['empleados', 'personas'] },
  { id: 'planillas', title: 'Planillas', groups: ['planilla', 'ingresos', 'liquidacion'] },
  { id: 'asistencia', title: 'Asistencia', groups: ['jornadas', 'asistencia'] },
  { id: 'movimientos', title: 'Movimientos', groups: ['movimientos'] },
  {
    id: 'catalogos',
    title: 'Catálogos',
    groups: ['catalogos', 'organizacion', 'ubicaciones', 'parametros'],
  },
];

export const normalizeSearch = (value) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[-_]/g, ' ');

export function searchCommands(commands, query, group = '') {
  const terms = normalizeSearch(query).trim().split(/\s+/).filter(Boolean);
  const phrase = terms.join(' ');
  return commands
    .filter((command) => {
      if (group && command.group !== group) return false;
      const text = normalizeSearch(
        `${command.title} ${command.slug} ${command.groupLabel} ${command.keywords || ''}`,
      );
      return terms.every((term) => text.includes(term));
    })
    .map((command) => {
      const title = normalizeSearch(command.title);
      const direct = normalizeSearch(`${command.slug} ${command.keywords || ''}`);
      // A named destination must rank ahead of incidental category matches.
      const rank =
        !phrase || title === phrase
          ? 0
          : title.startsWith(phrase)
            ? 1
            : title.includes(phrase)
              ? 2
              : terms.every((term) => title.includes(term))
                ? 3
                : normalizeSearch(command.slug) === phrase
                  ? 4
                  : terms.every((term) => direct.includes(term))
                    ? 5
                    : 6;
      return { command, rank };
    })
    .sort((a, b) => a.rank - b.rank)
    .map(({ command }) => command);
}
