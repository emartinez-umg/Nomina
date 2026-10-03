export const workFlow = [
  {
    id: 'configuration',
    title: 'Configuración',
    description: 'Prepara la organización y las reglas.',
    icon: 'settings',
  },
  {
    id: 'people',
    title: 'Personal',
    description: 'Contrata y completa los expedientes.',
    icon: 'people',
  },
  {
    id: 'time',
    title: 'Tiempo',
    description: 'Registra jornadas, asistencia y vacaciones.',
    icon: 'calendar',
  },
  {
    id: 'payroll',
    title: 'Ciclo de nómina',
    description: 'Abre el período, revisa y concilia.',
    icon: 'money',
  },
  {
    id: 'payments',
    title: 'Pagos',
    description: 'Registra los pagos y las liquidaciones.',
    icon: 'bank',
  },
  {
    id: 'reports',
    title: 'Consultas',
    description: 'Consulta información y resuelve dudas.',
    icon: 'help',
  },
];
export function flowGroup(item) {
  if (['transferencia-pago', 'liquidacion-laboral', 'liquidacion-concepto'].includes(item.slug))
    return 'payments';
  if (['calendario'].includes(item.slug) || ['jornadas', 'asistencia'].includes(item.group))
    return 'time';
  if (
    ['alta-empleado', 'recomendaciones', 'expediente'].includes(item.slug) ||
    ['empleados', 'personas'].includes(item.group)
  )
    return 'people';
  if (
    item.slug === 'usuarios' ||
    ['catalogos', 'organizacion', 'ubicaciones', 'parametros'].includes(item.group)
  )
    return 'configuration';
  if (['planilla', 'ingresos', 'movimientos', 'liquidacion'].includes(item.group)) return 'payroll';
  return 'reports';
}
