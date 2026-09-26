# Mejoras de experiencia y flujo de Recursos Humanos

Aplicación de las correcciones del reporte UI/UX, 25 de septiembre de 2026.

## Cambios visibles

| Problema revisado                                   | Comportamiento incorporado                                                                                                                                                                                                                          |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pérdida de datos al navegar o cerrar formularios    | Borradores en memoria para el alta y los formularios. Escape y Cerrar conservan el borrador; Descartar exige confirmación. El navegador advierte al salir con borradores.                                                                           |
| Estados de planilla sin comprobaciones              | Revisión guiada: BORRADOR → CALCULADA → PAGADA. El cierre exige conciliación, novedades revisadas y pagos confirmados suficientes. Los estados cerrados bloquean cambios.                                                                           |
| Totales distintos de los conceptos                  | Conciliar suma ingresos, resta deducciones y actualiza los totales de cada detalle con aritmética decimal. La pantalla muestra diferencias.                                                                                                         |
| Novedades sin vinculación a la planilla             | Incluir ingresos aprobados, descuentos y cuotas crea el concepto y conserva su origen. Las exclusiones requieren motivo; marcajes, movimientos, ausencias y vacaciones requieren revisión explícita. Una novedad monetaria no se incluye dos veces. |
| Selectores incompatibles                            | Relaciones filtradas por la empresa de la planilla y cuentas por el empleado del detalle. Cambiar el origen limpia los campos dependientes. La API también comprueba las relaciones.                                                                |
| Vacaciones sin revisión                             | Fechas, días laborales según jornada, cruces del mismo empleado y de su departamento. Saldo automático de 1.25 días por mes completo menos aprobadas y gozadas; solo se escribe la nota para aprobar. Se conserva el cálculo de la decisión.        |
| Baja fragmentada                                    | Registrar baja valida fecha y motivo, finaliza la relación e inactiva al empleado cuando no quedan relaciones activas o suspendidas. Incluye accesos a pendientes y liquidación.                                                                    |
| Liquidación sin pagos vinculados                    | Pantalla de liquidación con conceptos, total, pagos parciales, saldo pendiente, cuenta y referencia. No admite pagos superiores al saldo ni cambios sobre una liquidación con pagos confirmados.                                                    |
| Empresa perdida al navegar                          | Selector de empresa de trabajo compartido entre Inicio, listados y nuevas capturas; la selección se conserva durante la sesión del navegador.                                                                                                       |
| Filtros y contexto perdidos                         | Búsqueda, filtros combinados, rangos de fechas, orden, página y columnas se recuperan al volver al mismo listado y empresa.                                                                                                                         |
| Falta de salidas                                    | Exportación CSV de hasta 10,000 registros filtrados, planilla exportable y resúmenes individuales imprimibles o guardables como PDF.                                                                                                                |
| Errores técnicos ante respuestas vacías             | Mensajes de recuperación en español. Si una escritura no tiene respuesta confirmable, se pide revisar el listado antes de repetirla.                                                                                                                |
| Resumen incompleto de contratación                  | Revisión final con contrato, IGSS, nacimiento, correo y teléfono; reintento explícito de referencias si falla la carga.                                                                                                                             |
| Expedientes “completos” con controles insuficientes | Ocho controles de información pendiente y acceso a todos los empleados afectados, con paginación y exportación. No se presenta la lista como una validación de todos los requisitos del puesto.                                                     |
| Estado de transferencia libre                       | PENDIENTE, CONFIRMADA, RECHAZADA y ANULADA, con filtro por estado. Confirmar exige referencia, evita duplicados y no permite exceder el líquido.                                                                                                    |
| Sin historial ni motivo salarial                    | Historial transaccional con antes/después, fecha, motivo y operador. Cambiar salario exige motivo y fecha efectiva. El historial diferencia identidad autenticada por el ERP y operador local sin autenticación.                                    |

También se corrigió el acceso a marcajes desde el expediente: ahora filtra a través de las relaciones del empleado. La ayuda dentro de la aplicación describe los nuevos pasos.

## Alcance de los controles

- Los borradores y vistas contienen datos sensibles y se conservan únicamente en memoria. No sobreviven a una recarga, cierre de pestaña o reinicio; el navegador advierte antes de salir. Solo el identificador de empresa se guarda en sessionStorage.
- Vacaciones aplica la política solicitada: 1.25 días por mes completo (15 al año), acumulados hasta el inicio de la solicitud. Descuenta todas las aprobadas y gozadas, incluidas reservas futuras; las anuladas liberan saldo. Cuenta fechas inclusivas según las jornadas vigentes y una fecha solo una vez, aunque existan varios turnos. El ejemplo 07/11/2026–29/11/2026 suma 15 días de lunes a viernes.
- Las jornadas deben tener sus días laborales y vigencias registrados; no se presupone una jornada de lunes a viernes ni se añade un calendario de feriados. Las contrataciones simultáneas no duplican la acumulación; los intervalos sin contratación no acumulan y los meses incompletos no se prorratean. Los días aprobados se conservan aunque la jornada cambie después. Para aprobaciones antiguas sin detalle guardado se usa la jornada histórica; si no puede calcularse, se bloquea la aprobación y se explica el dato faltante.
- La conciliación opera sobre importes registrados. No genera cálculos legales de ISR, IGSS, indemnización ni prestaciones. Los importes de liquidación deben venir de un cálculo verificado.
- Registrar un pago documenta una transferencia ya realizada. No envía dinero al banco. Anular el registro de un pago de liquidación tampoco revierte una transferencia bancaria.
- La fecha efectiva salarial queda en el historial; el cambio de salario se aplica al guardar. No es un programador de salarios futuros.
- El historial comienza al instalar esta mejora. No reconstruye modificaciones anteriores ni escrituras realizadas directamente en Oracle o desde otras aplicaciones.
- La aplicación local sigue sin login. Para atribución autenticada se ofrece `resolveActor(req)` en `createApp`/`createNominaRouter`; el ERP anfitrión debe suministrar el actor de su sesión validada y aplicar autenticación, autorización y permisos de empresa. La selección de “Usuario creador” no constituye identidad autenticada.
- Los datos históricos con estados o tipos de conceptos distintos requieren revisión; la migración no los transforma silenciosamente.

## Instalación

En una base ERP existente, antes de arrancar la API actualizada:

```sh
npm run db:workflow
```

Crea, de forma aditiva e idempotente, `NOM_RH_EVENTO`, `NOM_RH_REVISION`, `NOM_RH_VACACION` y `NOM_RH_PAGO_LIQ`. Añade también la columna `RHV_CALCULO` a `NOM_RH_VACACION` para conservar el cálculo aprobado. No elimina tablas ni modifica registros de negocio. Las instalaciones nuevas incluyen estas tablas mediante `db/init.sql`; `db/RH_SEGUIMIENTO.sql` contiene el DDL correspondiente.

No eliminar estas tablas para volver a una versión anterior: pueden contener decisiones y pagos que deben conservarse. El DDL de Oracle realiza commits implícitos; el script se puede ejecutar de nuevo si la instalación se interrumpe.

## API de seguimiento

- `GET /hr/planilla/:id`: conciliación, fuentes y pagos. `POST` con `action` y `reason`: CONCILIAR, CALCULADA, PAGADA, BORRADOR o ANULADA, según las condiciones del estado.
- `POST /hr/planilla/:id/novedad`: `key`, `decision`, `reason`; INCLUIR también requiere `detailId` y `conceptId`. DESHACER elimina la revisión y su concepto vinculado mientras la planilla sea borrador.
- `GET /hr/vacacion/:id` y `POST`: revisar y decidir. La revisión devuelve `calculation` con fechas laborales, meses, acumulación, descuentos, saldo y `reviewToken`. APROBADA requiere `reviewToken` y `reason`; el servidor recalcula los importes, bloquea revisiones desactualizadas y serializa aprobaciones del mismo empleado. No acepta días ni saldos suministrados como sustitutos del cálculo automático.
- `GET /hr/baja/:id` y `POST`: el identificador es la relación laboral; confirmar requiere `date`, `reason`, `reviewed: true`.
- `GET /hr/liquidacion/:id` y `POST`: registrar pago confirmado con `bankId`, `date`, `amount`, `reference`; anular un registro mediante `action: ANULAR`, `paymentId`, `reason`.
- `GET /hr/historial?employee=...` o `?entity=...&id=...`, con paginación.
- `GET /{entidad}/exportar`: mismos filtros del listado, `columns` opcional. Exporta JSON con `filename`, `csv`, `total`; neutraliza fórmulas de hoja de cálculo.
- Edición genérica: `X-Change-Reason` codificado con `encodeURIComponent`, `X-Effective-Date` en formato YYYY-MM-DD. Son datos de auditoría, no credenciales.

Todas las rutas son relativas a `/api/nomina`. Los controles de flujo también se aplican al CRUD genérico y las escrituras fallidas revierten la transacción.

## Verificación

- `npm test`: validaciones, API, precisión decimal, filtros seguros, exportación y errores recuperables.
- `npm run test:oracle`: 51 formularios y 53 catálogos, altas atómicas, rollback y separación por empresa.
- `npm run test:workflow`: recorridos completos de planilla, novedades, pagos, vacaciones, baja, liquidación e historial; comprobación de intentos de omitir los pasos.
- `npm run test:init`: instalación limpia con 194 tablas ERP y cuatro complementarias.
- `npm run build`: compilación de producción.
- Navegador: recuperación de borradores del alta y de formularios cerrados con Escape, retorno al listado con búsqueda conservada, acciones de planillas cerradas y revisión visual de la pantalla de seguimiento.

Las pruebas de Oracle usan esquemas desechables con datos ficticios, que se eliminan al terminar. El servidor de revisión visual también usa un esquema temporal independiente.
