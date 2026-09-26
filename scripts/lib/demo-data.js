import { transformLegacy } from './migration-data.js';
// Explicit fictitious fixtures; never generated from a user's database records.
export function demoData({ nomina = true } = {}) {
  const source = {
    ERP_EMPRESA: [{ EMP_ID: '1', NOMBRE: 'Universidad de ejemplo' }],
    ERP_PERSONA: [
      { PER_ID: '1', NOMBRE: 'Ana López — ejemplo' },
      { PER_ID: '2', NOMBRE: 'Carlos Pérez — ejemplo' },
    ],
    ERP_USUARIO: [{ USU_ID: '1', NOMBRE: 'Operador de desarrollo' }],
    ERP_SUCURSAL: [{ SUC_ID: '1', NOMBRE: 'Campus central — ejemplo' }],
    ERP_DEPARTAMENTO: [{ DPT_ID: '1', NOMBRE: 'Administración — ejemplo' }],
    ERP_BANCO: [{ BAN_ID: '1', NOMBRE: 'Banco de ejemplo' }],
    CXC_DTE: [{ DTE_ID: '1', NOMBRE: 'Documento de prueba — sin validez fiscal' }],
  };
  if (nomina)
    Object.assign(source, {
      NOM_PUESTO: [
        { PUE_ID: '1', PUE_NOMBRE: 'Asistente administrativo', PUE_ES_VENDEDOR: '0' },
        { PUE_ID: '2', PUE_NOMBRE: 'Coordinador académico', PUE_ES_VENDEDOR: '0' },
      ],
      NOM_EMPLEADO: [
        {
          EML_ID: '1',
          PER_ID: '1',
          EMP_ID: '1',
          SUC_ID: '1',
          DPT_ID: '1',
          PUE_ID: '1',
          EML_CODIGO: 'EMP-001',
          EML_FECHA_INGRESO: '2026-01-05',
          EML_SALARIO: '5500',
          EML_IGSS: null,
          EML_ACTIVO: '1',
        },
      ],
      NOM_TIPO_CONTRATO: [{ TCT_ID: '1', TCT_NOMBRE: 'Indefinido', TCT_ACTIVO: '1' }],
      NOM_TIPO_AUSENCIA: [{ TAU_ID: '1', TAU_NOMBRE: 'Permiso' }],
      NOM_MOTIVO_BAJA: [{ MBA_ID: '1', MBA_NOMBRE: 'Renuncia', MBA_GENERA_INDEMNIZACION: '0' }],
      NOM_TIPO_DIA: [
        { TDI_ID: '1', TDI_NOMBRE: 'Ordinario' },
        { TDI_ID: '2', TDI_NOMBRE: 'Asueto' },
      ],
      NOM_TIPO_COMISION: [{ TCO_ID: '1', TCO_NOMBRE: 'Venta', TCO_ACTIVO: '1' }],
      NOM_CONCEPTO: [
        {
          NCO_ID: '1',
          NCO_NOMBRE: 'Sueldo base',
          NCO_TIPO: 'INGRESO',
          NCO_AFECTA_IGSS: '0',
          NCO_AFECTA_ISR: '0',
        },
      ],
      NOM_JORNADA: [{ JOR_ID: '1', EMP_ID: '1', JOR_NOMBRE: 'Jornada diurna', JOR_ACTIVA: '1' }],
      NOM_TIENDA_PRODUCTO: [
        {
          TDP_ID: '1',
          EMP_ID: '1',
          TDP_CODIGO: 'CAF-001',
          TDP_NOMBRE: 'Café de tienda',
          TDP_PRECIO: '12.50',
          TDP_ACTIVO: '1',
        },
      ],
    });
  return transformLegacy(source);
}
