# Flujo de formularios de Nómina

Clasificación funcional de los 51 formularios existentes. La navegación visual actual se conserva.

## Configuración

Prepara la organización y las reglas.

| Formulario                      | Ruta                                 | Tabla                        |
| ------------------------------- | ------------------------------------ | ---------------------------- |
| Puestos                         | /nomina/puesto                       | NOM_PUESTO                   |
| Tipos de contrato               | /nomina/tipo-contrato                | NOM_TIPO_CONTRATO            |
| Tipos de ausencia               | /nomina/tipo-ausencia                | NOM_TIPO_AUSENCIA            |
| Motivos de baja                 | /nomina/motivo-baja                  | NOM_MOTIVO_BAJA              |
| Tipos de día                    | /nomina/tipo-dia                     | NOM_TIPO_DIA                 |
| Tipos de ingreso                | /nomina/tipo-ingreso                 | NOM_TIPO_INGRESO             |
| Tipos de descuento              | /nomina/tipo-descuento               | NOM_TIPO_DESCUENTO           |
| Conceptos                       | /nomina/concepto                     | NOM_CONCEPTO                 |
| Parámetros laborales            | /nomina/parametro-laboral            | NOM_PARAMETRO_LABORAL        |
| Rangos de ISR                   | /nomina/isr-rango                    | NOM_ISR_RANGO                |
| Empresas                        | /nomina/erp-empresa                  | ERP_EMPRESA                  |
| Sucursales                      | /nomina/erp-sucursal                 | ERP_SUCURSAL                 |
| Departamentos de trabajo        | /nomina/erp-departamento             | ERP_DEPARTAMENTO             |
| Bancos                          | /nomina/erp-banco                    | ERP_BANCO                    |
| Tipos de documento de identidad | /nomina/erp-tipo-documento-identidad | ERP_TIPO_DOCUMENTO_IDENTIDAD |
| Tipos de dirección              | /nomina/erp-tipo-direccion           | ERP_TIPO_DIRECCION           |
| Direcciones                     | /nomina/erp-direccion                | ERP_DIRECCION                |
| Zonas                           | /nomina/erp-zona                     | ERP_ZONA                     |
| Municipios                      | /nomina/erp-municipio                | ERP_MUNICIPIO                |
| Departamentos geográficos       | /nomina/erp-departamento-geografico  | ERP_DEPARTAMENTO_GEOGRAFICO  |
| Países                          | /nomina/erp-pais                     | ERP_PAIS                     |

## Personal

Contrata y completa los expedientes.

| Formulario              | Ruta                             | Tabla                        |
| ----------------------- | -------------------------------- | ---------------------------- |
| Empleados               | /nomina/empleado                 | NOM_EMPLEADO                 |
| Relaciones laborales    | /nomina/relacion-laboral         | NOM_RELACION_LABORAL         |
| Jefaturas laborales     | /nomina/jefatura-laboral         | NOM_JEFATURA_LABORAL         |
| Contactos de emergencia | /nomina/contacto-emergencia      | NOM_CONTACTO_EMERGENCIA      |
| Cuentas bancarias       | /nomina/cuenta-bancaria-empleado | NOM_CUENTA_BANCARIA_EMPLEADO |
| Personas                | /nomina/erp-persona              | ERP_PERSONA                  |
| Documentos de identidad | /nomina/erp-persona-documento    | ERP_PERSONA_DOCUMENTO        |
| Correos de personas     | /nomina/erp-persona-correo       | ERP_PERSONA_CORREO           |
| Teléfonos de personas   | /nomina/erp-persona-telefono     | ERP_PERSONA_TELEFONO         |
| Direcciones de personas | /nomina/erp-persona-direccion    | ERP_PERSONA_DIRECCION        |

## Tiempo

Registra jornadas, asistencia y vacaciones.

| Formulario             | Ruta                     | Tabla                |
| ---------------------- | ------------------------ | -------------------- |
| Jornadas               | /nomina/jornada          | NOM_JORNADA          |
| Detalle de jornadas    | /nomina/jornada-detalle  | NOM_JORNADA_DETALLE  |
| Asignación de jornadas | /nomina/relacion-jornada | NOM_RELACION_JORNADA |
| Marcajes               | /nomina/marcaje          | NOM_MARCAJE          |
| Ausencias              | /nomina/ausencia         | NOM_AUSENCIA         |
| Vacaciones             | /nomina/vacacion         | NOM_VACACION         |

## Ciclo de nómina

Abre el período, revisa y concilia.

| Formulario               | Ruta                        | Tabla                   |
| ------------------------ | --------------------------- | ----------------------- |
| Períodos                 | /nomina/periodo             | NOM_PERIODO             |
| Planillas                | /nomina/nomina              | NOM_NOMINA              |
| Detalle de planillas     | /nomina/nomina-detalle      | NOM_NOMINA_DETALLE      |
| Conceptos de planilla    | /nomina/nomina-concepto     | NOM_NOMINA_CONCEPTO     |
| Movimientos              | /nomina/movimiento          | NOM_MOVIMIENTO          |
| Descuentos aplicados     | /nomina/descuento-aplicado  | NOM_DESCUENTO_APLICADO  |
| Préstamos y anticipos    | /nomina/prestamo            | NOM_PRESTAMO            |
| Cuotas de préstamos      | /nomina/prestamo-cuota      | NOM_PRESTAMO_CUOTA      |
| Productos de tienda      | /nomina/tienda-producto     | NOM_TIENDA_PRODUCTO     |
| Consumos de tienda       | /nomina/tienda-consumo      | NOM_TIENDA_CONSUMO      |
| Ingresos variables       | /nomina/ingreso-variable    | NOM_INGRESO_VARIABLE    |
| Detalle de liquidaciones | /nomina/liquidacion-detalle | NOM_LIQUIDACION_DETALLE |

## Pagos

Registra los pagos y las liquidaciones.

| Formulario              | Ruta                        | Tabla                   |
| ----------------------- | --------------------------- | ----------------------- |
| Liquidaciones laborales | /nomina/liquidacion-laboral | NOM_LIQUIDACION_LABORAL |
| Transferencias de pago  | /nomina/transferencia-pago  | NOM_TRANSFERENCIA_PAGO  |

## Consultas

Consulta información y resuelve dudas.

| Formulario | Ruta | Tabla |
| ---------- | ---- | ----- |

Recorrido: preparar catálogos y empresa → contratar y completar expediente → registrar tiempo/novedades → abrir período y conciliar planilla → registrar pagos → consultar historial. El alta guiada, expediente, revisión, calendario, recomendaciones, usuarios y guía complementan esos formularios.
