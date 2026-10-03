import { guide } from './user-guide.js';
const related = {
  vacacion: {
    requires: 'Empleado con relación laboral y jornada vigentes.',
    problem:
      'Si no hay saldo o jornada, abre el expediente y revisa la asignación antes de aprobar.',
    links: [
      ['relacion-jornada', 'Asignar jornada'],
      ['empleado', 'Ver empleados'],
    ],
  },
  nomina: {
    requires: 'Período abierto, empleados y conceptos registrados.',
    problem:
      'Si los totales no coinciden, concilia los conceptos. Revisa cada novedad antes de calcular.',
    links: [
      ['periodo', 'Períodos'],
      ['concepto', 'Conceptos'],
    ],
  },
  'transferencia-pago': {
    requires: 'Planilla calculada y cuenta bancaria del empleado.',
    problem: 'CONFIRMADA exige referencia bancaria y no puede superar el líquido pendiente.',
    links: [
      ['cuenta-bancaria-empleado', 'Cuentas bancarias'],
      ['nomina', 'Planillas'],
    ],
  },
  periodo: {
    requires: 'Año, mes y quincena del calendario de pagos.',
    problem:
      'Solo se elimina un período abierto y vacío. Si tiene dependencias, el mensaje indica cuáles.',
    links: [['nomina', 'Ver planillas']],
  },
  'erp-empresa': {
    requires: 'Razón social y NIT.',
    problem:
      'La tabla de empresa no contiene dirección, teléfono, correo, número patronal, actividad económica ni circunscripción. Las direcciones se administran con las sucursales.',
    links: [['erp-sucursal', 'Sucursales']],
  },
};
export function helpFor(slug, table) {
  const section = guide.find((s) => s.actions.some(([route]) => route === slug));
  return {
    title: table?.title || 'Ayuda de Nómina',
    purpose:
      table?.description ||
      section?.title ||
      'Consulta y administra la información de esta sección.',
    steps:
      section?.text ||
      'Usa el buscador o los filtros para encontrar registros. Revisa las ayudas de los campos antes de guardar. La acción principal está al final del formulario.',
    requires:
      related[slug]?.requires ||
      'Completa primero los catálogos que solicitan los selectores de este formulario.',
    problem:
      related[slug]?.problem ||
      'Los campos marcados en rojo explican qué corregir. Si falta una referencia, solicita su creación al administrador.',
    links: related[slug]?.links || section?.actions || [['guia', 'Abrir guía completa']],
  };
}
