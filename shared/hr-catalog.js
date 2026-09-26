// Shared ERP masters needed by HR. Security/accounting entities stay with the ERP host.
export const masterDefinitions = {
  ERP_PERSONA: ['Personas', 'personas', ['PER_NOMBRES', 'PER_APELLIDOS']],
  ERP_PERSONA_DOCUMENTO: ['Documentos de identidad', 'personas', ['PER_ID', 'PDC_NUMERO']],
  ERP_PERSONA_CORREO: ['Correos de personas', 'personas', ['PER_ID', 'PCO_CORREO']],
  ERP_PERSONA_TELEFONO: ['Teléfonos de personas', 'personas', ['PER_ID', 'PTE_NUMERO']],
  ERP_PERSONA_DIRECCION: ['Direcciones de personas', 'personas', ['PER_ID', 'DIR_ID']],
  ERP_EMPRESA: ['Empresas', 'organizacion', ['EMP_RAZON_SOCIAL']],
  ERP_SUCURSAL: ['Sucursales', 'organizacion', ['EMP_ID', 'SUC_NOMBRE']],
  ERP_DEPARTAMENTO: ['Departamentos de trabajo', 'organizacion', ['EMP_ID', 'DPT_NOMBRE']],
  ERP_BANCO: ['Bancos', 'organizacion', ['BAN_NOMBRE']],
  ERP_TIPO_DOCUMENTO_IDENTIDAD: ['Tipos de documento de identidad', 'ubicaciones', ['TDI_NOMBRE']],
  ERP_TIPO_DIRECCION: ['Tipos de dirección', 'ubicaciones', ['TDR_NOMBRE']],
  ERP_DIRECCION: ['Direcciones', 'ubicaciones', ['DIR_DETALLE', 'ZON_ID']],
  ERP_ZONA: ['Zonas', 'ubicaciones', ['MUN_ID', 'ZON_NOMBRE']],
  ERP_MUNICIPIO: ['Municipios', 'ubicaciones', ['DPT_ID', 'MUN_NOMBRE']],
  ERP_DEPARTAMENTO_GEOGRAFICO: [
    'Departamentos geográficos',
    'ubicaciones',
    ['PAI_ID', 'DPT_NOMBRE'],
  ],
  ERP_PAIS: ['Países', 'ubicaciones', ['PAI_NOMBRE']],
};
export const masterGroups = [
  { id: 'personas', label: 'Personas y datos de contacto' },
  { id: 'organizacion', label: 'Organización y bancos' },
  { id: 'ubicaciones', label: 'Ubicaciones y documentos' },
];
export const friendlyOptions = {
  PER_TIPO: { F: 'Persona física', J: 'Persona jurídica' },
};
export const initialDefaults = {
  ERP_PERSONA: { PER_TIPO: 'F' },
  NOM_EMPLEADO: { EML_SALARIO_BONIFICACION_DECRETO: '0' },
  NOM_RELACION_LABORAL: { RLA_ESTADO: 'ACTIVA' },
  NOM_PERIODO: { NPE_ESTADO: 'ABIERTO', NPE_TIPO: 'MENSUAL' },
  NOM_NOMINA_DETALLE: { NOD_INGRESOS: '0', NOD_DEDUCCIONES: '0', NOD_LIQUIDO: '0' },
  NOM_NOMINA: { NOM_ESTADO: 'BORRADOR' },
  NOM_TRANSFERENCIA_PAGO: { TRP_ESTADO: 'PENDIENTE' },
  NOM_VACACION: { VAC_ESTADO: 'SOLICITADA' },
};
export function referenceFilters(field, context = {}) {
  const target = field.ref?.table;
  const filters = {};
  if (['ERP_SUCURSAL', 'ERP_DEPARTAMENTO'].includes(target) && context.EMP_ID)
    filters.EMP_ID = context.EMP_ID;
  if (target === 'NOM_EMPLEADO' && context.EMP_ID) filters.EMP_ID = context.EMP_ID;
  if (target === 'NOM_RELACION_LABORAL' && context.EMP_ID) filters.__company = context.EMP_ID;
  if (['NOM_NOMINA', 'NOM_NOMINA_DETALLE'].includes(target) && context.EMP_ID)
    filters.__company = context.EMP_ID;
  if (target === 'NOM_RELACION_LABORAL' && context.EML_ID) filters.EML_ID = context.EML_ID;
  if (target === 'NOM_CUENTA_BANCARIA_EMPLEADO' && context.EML_ID) filters.EML_ID = context.EML_ID;
  if (target === 'ERP_PERSONA' && field.name === 'PER_ID' && context.__employee)
    filters.PER_TIPO = 'F';
  return filters;
}
