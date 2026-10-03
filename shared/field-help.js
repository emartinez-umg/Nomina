import { friendlyOptions } from './hr-catalog.js';
export const isPhone = (f) =>
  f.input === 'tel' || f.name === 'PTE_NUMERO' || /_TELEFONO$/.test(f.name);
export function phoneInput(value, previous = '') {
  const digits = String(value).replace(/[ -]/g, '');
  return /^\d{0,8}$/.test(digits) ? digits : previous;
}
export const validPhone = (value) => /^\d{4}-?\d{4}$/.test(String(value));
const examples = {
  PER_NOMBRES: 'Ana María',
  PER_APELLIDOS: 'López García',
  PER_RAZON_SOCIAL: 'Servicios del Centro, S. A.',
  PER_NOMBRE_COMERCIAL: 'Servicios del Centro',
  EMP_RAZON_SOCIAL: 'Empresa de ejemplo, S. A.',
  EMP_NOMBRE_COMERCIAL: 'Empresa de ejemplo',
  EMP_NIT: '1234567-9',
  PDC_NUMERO: '1234567890101',
  EML_CODIGO: 'Se asigna al guardar',
  EML_IGSS: '123456789',
  NCE_NOMBRE: 'María López',
  NCE_PARENTESCO: 'Madre',
  CBE_NUMERO: '00123456789',
  CBE_TIPO: 'AHORRO',
  PTE_TIPO: 'PERSONAL',
  PUE_NOMBRE: 'Asistente de Recursos Humanos',
  TCT_NOMBRE: 'Indefinido',
  TAU_NOMBRE: 'Permiso personal',
  MBA_NOMBRE: 'Renuncia',
  TIN_NOMBRE: 'Bono por desempeño',
  TDE_NOMBRE: 'Descuento de tienda',
  NCO_NOMBRE: 'Sueldo base',
  NCO_TIPO: 'INGRESO',
  JOR_NOMBRE: 'Jornada diurna',
  NPE_TIPO: 'Quincena',
  NPE_ANIO: '2026',
  RLA_MOTIVO_BAJA: 'Renuncia presentada por el empleado',
  LIL_MOTIVO: 'Finalización de la relación laboral',
  AUS_CERTIFICADO_IGSS: 'CERT-001',
  TDP_CODIGO: 'PROD-001',
  TDP_NOMBRE: 'Café',
  INV_REFERENCIA: 'VENTA-001',
  TRP_REFERENCIA: 'Referencia de la operación bancaria',
  NPL_CODIGO: 'FACTOR_HORA_EXTRA',
  NPL_NOMBRE: 'Factor de hora extra ordinaria',
  NPL_VALOR: '1.5',
  SUC_CODIGO: 'SUC-001',
  SUC_NOMBRE: 'Sede central',
  DPT_CODIGO: 'RRHH',
  DPT_NOMBRE: 'Recursos Humanos',
  BAN_NOMBRE: 'Banco de ejemplo',
  TDR_NOMBRE: 'Domicilio',
  DIR_DETALLE: '5a avenida 10-20, zona 1',
  DIR_REFERENCIA: 'Frente al parque central',
  DIR_LATITUD: '14.634915',
  DIR_LONGITUD: '-90.506882',
  ZON_NOMBRE: 'Zona 1',
  ZON_CODIGO_POSTAL: '01001',
  MUN_NOMBRE: 'Guatemala',
  PAI_NOMBRE: 'Guatemala',
  PAI_CODIGO_ISO: 'GT',
  EML_SALARIO_ORDINARIO_MENSUAL: '5500.00',
  EML_SALARIO_BONIFICACION_DECRETO: '250.00',
  JOD_MINUTOS_DESCANSO: '60',
  JOD_MINUTOS_ORDINARIOS: '480',
  NOD_DIAS_TRABAJADOS: '15',
  NPC_NUMERO: '1',
  NPR_CUOTAS: '6',
};
const scoped = {
  'NOM_TIPO_DIA.TDI_NOMBRE': 'Ordinario',
  'ERP_TIPO_DOCUMENTO_IDENTIDAD.TDI_NOMBRE': 'DPI',
  'ERP_DEPARTAMENTO_GEOGRAFICO.DPT_NOMBRE': 'Guatemala',
};
export function exampleFor(f, tableName) {
  if (f.example) return f.example;
  if (isPhone(f)) return '1234-5678';
  if (f.input === 'email' || /_CORREO$/.test(f.name)) return 'correo@dominio.com';
  if (f.ref) return `Busca ${f.label.toLowerCase()}`;
  if (f.boolean) return /_ACTIV[OA]$/.test(f.name) ? 'Activo / inactivo' : 'Sí / no';
  if (f.options)
    return friendlyOptions[f.name]?.[f.options[0]] || f.options[0].replaceAll('_', ' ');
  if (f.input === 'time') return /SALIDA/.test(f.name) ? '17:00' : '08:00';
  if (f.default === 'SYSTIMESTAMP') return 'Se asignará al guardar';
  if (f.type === 'DATE') return /NACIMIENTO/.test(f.name) ? '15/03/1990' : '15/09/2026';
  if (f.type === 'TIMESTAMP') return '15/09/2026 08:00';
  if (scoped[`${tableName}.${f.name}`]) return scoped[`${tableName}.${f.name}`];
  if (examples[f.name]) return examples[f.name];
  if (f.type === 'NUMBER') {
    if (/PORCENTAJE/.test(f.name)) return '5';
    if (/HORAS/.test(f.name)) return f.scale ? '8.50' : '8';
    if (/MINUTOS/.test(f.name)) return '15';
    if (/DIAS|CANTIDAD/.test(f.name)) return '1';
    return f.scale ? '100.00' : '1';
  }
  if (/_ESTADO$/.test(f.name)) return 'Estado acordado por tu organización';
  if (/OBSERVACION/.test(f.name)) return 'Detalle adicional para Recursos Humanos';
  if (/DESCRIPCION/.test(f.name)) return 'Ajuste correspondiente al período';
  if (/NOMBRE/.test(f.name)) return 'Nombre descriptivo del registro';
  return `Escribe ${f.label.toLowerCase()}`;
}
export function hintFor(f) {
  const example = exampleFor(f);
  if (f.identity) return 'Identificador asignado automáticamente al guardar.';
  if (isPhone(f))
    return 'Ej.: 1234-5678. Escribe 8 dígitos, sin letras ni código de país. Se guarda sin guion.';
  if (f.input === 'email' || /_CORREO$/.test(f.name))
    return 'Ej.: correo@dominio.com. Incluye el usuario, @ y el dominio.';
  if (f.ref)
    return `${f.hint || `Busca y selecciona ${f.label.toLowerCase()} por su nombre; no escribas el ID.`} Si falta, usa «Crear» cuando esté disponible.`;
  if (f.boolean)
    return /_ACTIV[OA]$/.test(f.name)
      ? 'Sí: registro activo. No: registro inactivo; sus datos se conservan.'
      : `Activa «Sí» si corresponde ${f.label.toLowerCase()}; de lo contrario deja «No».`;
  if (f.options) {
    if (f.name === 'NPE_MES')
      return 'Selecciona el mes al que corresponde el período, por ejemplo septiembre.';
    if (f.name === 'PER_TIPO')
      return 'Persona física para empleados; persona jurídica para empresas.';
    return f.hint || `Selecciona una opción de la lista. Ej.: ${example}.`;
  }
  if (f.default === 'SYSTIMESTAMP')
    return 'Fecha y hora asignadas por el sistema al crear el registro.';
  if (f.input === 'time') return `Ej.: ${example}. Usa hora de 24 horas, sin a. m. ni p. m.`;
  if (f.type === 'DATE')
    return `Ej.: ${example} (día/mes/año). ${/NACIMIENTO/.test(f.name) ? 'Selecciona la fecha de nacimiento de la persona.' : /FIN|HASTA|BAJA/.test(f.name) ? 'La fecha final no debe ser anterior a la inicial.' : 'Selecciona la fecha en el calendario.'}`;
  if (f.type === 'TIMESTAMP') return `Ej.: ${example}. Fecha y hora local en formato de 24 horas.`;
  if (f.type === 'NUMBER')
    return `${f.hint ? f.hint + ' ' : ''}Ej.: ${example}. ${f.scale ? `Hasta ${f.scale} decimales, con punto y sin separadores de miles` : 'Solo números enteros'}${f.min !== undefined ? `; ${f.exclusiveMin ? 'mayor que' : 'mínimo'} ${f.min}` : ''}.`;
  const extra = {
    PDC_NUMERO: 'Usa el número del documento seleccionado; el ejemplo corresponde a un DPI.',
    CBE_NUMERO: 'Copia el número indicado por el banco, conservando ceros iniciales.',
    PAI_CODIGO_ISO: 'Código de dos letras del país.',
    EML_CODIGO: 'Código interno único del empleado.',
    EMP_NIT: 'Sin espacios, con guion y dígito verificador. Puede terminar en K.',
  }[f.name];
  if (/_ESTADO$/.test(f.name))
    return 'Escribe el estado acordado por tu organización. Este campo no tiene una lista de estados definida en la base de datos.';
  return `${f.hint ? f.hint + ' ' : ''}Ej.: ${example}. ${extra ? extra + ' ' : ''}Hasta ${f.maxLength} caracteres simples; con tildes el límite puede ser menor.`;
}
