# Entidades y rutas

35 entidades de Nómina. Prefijo: `/api/nomina`. Todas tienen listado, consulta, creación y edición.

| Tabla                        | Ruta                      | Acción de eliminación                             |
| ---------------------------- | ------------------------- | ------------------------------------------------- |
| NOM_PUESTO                   | /puesto                   | Borrado físico con confirmación                   |
| NOM_TIPO_CONTRATO            | /tipo-contrato            | TCT_ACTIVO = 0                                    |
| NOM_TIPO_AUSENCIA            | /tipo-ausencia            | Borrado físico con confirmación                   |
| NOM_MOTIVO_BAJA              | /motivo-baja              | Borrado físico con confirmación                   |
| NOM_TIPO_DIA                 | /tipo-dia                 | Borrado físico con confirmación                   |
| NOM_TIPO_INGRESO             | /tipo-ingreso             | TIN_ACTIVO = 0                                    |
| NOM_TIPO_DESCUENTO           | /tipo-descuento           | TDE_ACTIVO = 0                                    |
| NOM_CONCEPTO                 | /concepto                 | Borrado físico con confirmación                   |
| NOM_EMPLEADO                 | /empleado                 | EML_ACTIVO = 0                                    |
| NOM_RELACION_LABORAL         | /relacion-laboral         | Editar estado explícitamente; DELETE devuelve 409 |
| NOM_JEFATURA_LABORAL         | /jefatura-laboral         | JRL_ACTIVA = 0                                    |
| NOM_CONTACTO_EMERGENCIA      | /contacto-emergencia      | Borrado físico con confirmación                   |
| NOM_CUENTA_BANCARIA_EMPLEADO | /cuenta-bancaria-empleado | Borrado físico con confirmación                   |
| NOM_JORNADA                  | /jornada                  | JOR_ACTIVA = 0                                    |
| NOM_JORNADA_DETALLE          | /jornada-detalle          | Borrado físico con confirmación                   |
| NOM_RELACION_JORNADA         | /relacion-jornada         | Borrado físico con confirmación                   |
| NOM_PERIODO                  | /periodo                  | Editar estado explícitamente; DELETE devuelve 409 |
| NOM_NOMINA                   | /nomina                   | NOM_ESTADO = ANULADA                              |
| NOM_NOMINA_DETALLE           | /nomina-detalle           | Borrado físico con confirmación                   |
| NOM_NOMINA_CONCEPTO          | /nomina-concepto          | Borrado físico con confirmación                   |
| NOM_MARCAJE                  | /marcaje                  | Borrado físico con confirmación                   |
| NOM_AUSENCIA                 | /ausencia                 | Editar estado explícitamente; DELETE devuelve 409 |
| NOM_VACACION                 | /vacacion                 | VAC_ESTADO = ANULADA                              |
| NOM_MOVIMIENTO               | /movimiento               | Borrado físico con confirmación                   |
| NOM_DESCUENTO_APLICADO       | /descuento-aplicado       | DAP_ESTADO = ANULADO                              |
| NOM_PRESTAMO                 | /prestamo                 | Editar estado explícitamente; DELETE devuelve 409 |
| NOM_PRESTAMO_CUOTA           | /prestamo-cuota           | Borrado físico con confirmación                   |
| NOM_TIENDA_PRODUCTO          | /tienda-producto          | TDP_ACTIVO = 0                                    |
| NOM_TIENDA_CONSUMO           | /tienda-consumo           | CTD_ESTADO = ANULADO                              |
| NOM_INGRESO_VARIABLE         | /ingreso-variable         | INV_ESTADO = ANULADA                              |
| NOM_LIQUIDACION_LABORAL      | /liquidacion-laboral      | Borrado físico con confirmación                   |
| NOM_LIQUIDACION_DETALLE      | /liquidacion-detalle      | Borrado físico con confirmación                   |
| NOM_TRANSFERENCIA_PAGO       | /transferencia-pago       | Editar estado explícitamente; DELETE devuelve 409 |
| NOM_PARAMETRO_LABORAL        | /parametro-laboral        | NPL_ACTIVO = 0                                    |
| NOM_ISR_RANGO                | /isr-rango                | ISR_ACTIVO = 0                                    |

## Maestros de Recursos Humanos

Estos 16 formularios gestionan tablas ERP existentes. Los selectores de ERP_USUARIO y CXC_DTE siguen siendo de lectura.

| Formulario                      | Tabla                        | Ruta API                                 |
| ------------------------------- | ---------------------------- | ---------------------------------------- |
| Personas                        | ERP_PERSONA                  | /api/nomina/erp-persona                  |
| Documentos de identidad         | ERP_PERSONA_DOCUMENTO        | /api/nomina/erp-persona-documento        |
| Correos de personas             | ERP_PERSONA_CORREO           | /api/nomina/erp-persona-correo           |
| Teléfonos de personas           | ERP_PERSONA_TELEFONO         | /api/nomina/erp-persona-telefono         |
| Direcciones de personas         | ERP_PERSONA_DIRECCION        | /api/nomina/erp-persona-direccion        |
| Empresas                        | ERP_EMPRESA                  | /api/nomina/erp-empresa                  |
| Sucursales                      | ERP_SUCURSAL                 | /api/nomina/erp-sucursal                 |
| Departamentos de trabajo        | ERP_DEPARTAMENTO             | /api/nomina/erp-departamento             |
| Bancos                          | ERP_BANCO                    | /api/nomina/erp-banco                    |
| Tipos de documento de identidad | ERP_TIPO_DOCUMENTO_IDENTIDAD | /api/nomina/erp-tipo-documento-identidad |
| Tipos de dirección              | ERP_TIPO_DIRECCION           | /api/nomina/erp-tipo-direccion           |
| Direcciones                     | ERP_DIRECCION                | /api/nomina/erp-direccion                |
| Zonas                           | ERP_ZONA                     | /api/nomina/erp-zona                     |
| Municipios                      | ERP_MUNICIPIO                | /api/nomina/erp-municipio                |
| Departamentos geográficos       | ERP_DEPARTAMENTO_GEOGRAFICO  | /api/nomina/erp-departamento-geografico  |
| Países                          | ERP_PAIS                     | /api/nomina/erp-pais                     |
