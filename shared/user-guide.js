export const guide = [
  {
    title: '1. Empieza en el dashboard',
    text: 'Inicio muestra empleados activos, salarios mensuales registrados, vacaciones solicitadas, ingresos y descuentos pendientes, planillas recientes y expedientes incompletos. La empresa de trabajo se conserva al navegar. Pulsa Actualizar resumen después de trabajar. La lista de información pendiente revisa relación, banco, documento, contacto, emergencia, dirección, jornada y tipo de contrato; Ver todos permite recorrer todos los expedientes. La distribución por departamento usa relaciones laborales activas; un empleado puede aparecer en varios departamentos.',
    actions: [['dashboard', 'Abrir dashboard']],
  },
  {
    title: '2. Prepara los datos de la organización',
    text: 'Registra la empresa, sus sucursales, departamentos de trabajo, puestos y tipos de contrato. Para una sucursal necesitas una dirección. Puedes crear cualquier catálogo faltante con “Crear” debajo del selector, conservando el formulario que estabas completando. Las direcciones usan país → departamento geográfico → municipio → zona → dirección. Los departamentos geográficos son distintos de los departamentos de trabajo.',
    actions: [
      ['erp-empresa', 'Empresas'],
      ['erp-sucursal', 'Sucursales'],
      ['erp-departamento', 'Departamentos de trabajo'],
      ['puesto', 'Puestos'],
      ['tipo-contrato', 'Tipos de contrato'],
    ],
  },
  {
    title: '3. Contrata a un empleado',
    text: 'Pulsa Contratar empleado. En Persona, escribe nombres y apellidos o busca una persona física existente; agrega correo y teléfono si los tienes. En Datos del empleado, selecciona la empresa; el código se asigna al guardar. Ingresa salario ordinario mensual y bonificación por separado. En Contratación, selecciona puesto, sucursal, departamento, tipo de contrato y fecha de ingreso. El usuario creador se toma de la sesión y no se puede seleccionar ni cambiar. Cada rol solo puede abrir las secciones autorizadas. Revisa y confirma: persona, contactos nuevos, empleado y relación laboral se guardan juntos. Si falla un dato, el alta se revierte. Los catálogos creados con “Crear” se guardan independientemente. Para recontratar a alguien que ya es empleado de la empresa, agrega una relación laboral desde su expediente.',
    actions: [['alta-empleado', 'Contratar empleado']],
  },
  {
    title: '4. Completa el expediente',
    text: 'En Empleados, pulsa Expediente. Desde allí puedes editar la persona y su salario, registrar documentos de identidad, correos, teléfonos, direcciones, contactos de emergencia y cuentas bancarias. Si el banco o tipo de documento no existe, créalo desde su selector. Para cada relación laboral puedes asignar una jornada y registrar ingresos variables. Los botones de vacaciones, ausencias, préstamos y descuentos muestran únicamente los registros del empleado.',
    actions: [
      ['empleado', 'Empleados'],
      ['erp-persona', 'Personas'],
    ],
  },
  {
    title: '5. Organiza jornadas y novedades',
    text: 'Crea una jornada y sus horarios en Detalle de jornadas; después asígnala a la relación laboral. Registra marcajes, ausencias y vacaciones con sus fechas. Las vacaciones se crean SOLICITADAS. Usa Revisar para consultar los días laborales exactos según la jornada, incluidos sábados y domingos cuando sean laborables, y los cruces del mismo empleado y de su departamento. Se precargan fechas, días y saldo: 1.25 días por cada mes completo desde la contratación hasta el inicio de las vacaciones, menos las vacaciones aprobadas y gozadas. Para aprobar solo escribe la nota de RR. HH. Si falta una jornada vigente o el saldo es insuficiente, corrige la información antes de aprobar. Anular una aprobación libera los días reservados. Después puedes registrar el goce o anular según el estado. Registra préstamos y sus cuotas, consumos, ingresos variables y descuentos en sus formularios. Desde Revisar planilla puedes incluir los ingresos aprobados, descuentos y cuotas mediante un concepto compatible, o excluirlos con motivo. Marcajes, ausencias, vacaciones y movimientos requieren documentar la revisión y registrar sus efectos cuando corresponda.',
    actions: [
      ['jornada', 'Jornadas'],
      ['vacacion', 'Vacaciones'],
      ['ingreso-variable', 'Ingresos variables'],
      ['descuento-aplicado', 'Descuentos aplicados'],
    ],
  },
  {
    title: '6. Registra y revisa la planilla',
    text: 'Crea un período con año, mes, tipo y quincena cuando corresponda. Crea la planilla en BORRADOR y agrega sus empleados y conceptos. En Revisar planilla comprueba novedades y diferencias; Conciliar totales suma ingresos, resta deducciones y actualiza el líquido por empleado. Solo podrás marcar CALCULADA con los conceptos conciliados y las novedades revisadas. Los importes de impuestos, prestaciones y prorrateos deben provenir de un cálculo verificado; no se generan tasas automáticamente. La planilla calculada bloquea cambios del detalle. Puedes reabrirla si no tiene pagos confirmados.',
    actions: [
      ['periodo', 'Períodos'],
      ['nomina', 'Planillas'],
      ['nomina-detalle', 'Detalles'],
      ['nomina-concepto', 'Conceptos de planilla'],
    ],
  },
  {
    title: '7. Registra pagos y bajas',
    text: 'Las transferencias documentan pagos ya realizados y no envían dinero al banco. Regístralas en una planilla CALCULADA: PENDIENTE, CONFIRMADA, RECHAZADA o ANULADA. Confirmar requiere referencia y no permite superar el líquido. Cierra como PAGADA desde Revisar cuando todos los líquidos estén cubiertos. Para una baja usa Registrar baja, revisa pendientes e indica fecha y motivo; se finaliza la relación y se inactiva al empleado si no quedan otras relaciones vigentes. Continúa con la liquidación, sus conceptos y pagos parciales o totales en Revisar liquidación.',
    actions: [
      ['transferencia-pago', 'Transferencias'],
      ['relacion-laboral', 'Relaciones laborales'],
      ['liquidacion-laboral', 'Liquidaciones'],
    ],
  },
  {
    title: '8. Busca, corrige y recupera tu contexto',
    text: 'Usa la búsqueda por nombres y referencias, filtros combinados, rangos de fechas y Columnas. El listado recupera tu búsqueda, filtros, orden, columnas y página al regresar. Exportar CSV descarga hasta 10,000 registros filtrados, no solo la página visible. Las planillas ofrecen resúmenes individuales para imprimir o guardar como PDF. Los borradores de formularios y contrataciones se guardan automáticamente en este navegador después de dejar de escribir y se recuperan al volver a entrar. Caducan tras 15 días sin cambios. No se sincronizan entre computadoras. Si el navegador no permite guardar, aparece un aviso. Al editar, el sistema detecta si el registro cambió desde que lo abriste y conserva el borrador para revisarlo. Usa Descartar para eliminarlos. Los cambios de salario exigen motivo y fecha efectiva y quedan en el historial del expediente. Los enlaces desde un expediente conservan el filtro del empleado y lo completan al agregar registros. Editar guarda cambios; Inactivar o Anular conserva la fila donde el esquema lo permite. Eliminar solo se ofrece donde corresponde, pide confirmación y Oracle bloquea registros con dependencias. Si una referencia falta, usa “Crear”; al guardar queda seleccionada sin perder el formulario principal. Cada campo incluye una ayuda y un ejemplo de formato. Los correos usan el formato correo@dominio.com. Los teléfonos requieren ocho dígitos, sin letras ni código de país: puedes pegar 1234-5678 y se guardará como 12345678. Los importes no llevan separadores de miles al escribirlos.',
    actions: [],
  },
];
