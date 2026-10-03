# Revisión del libro de salarios

Estado: comparación oficial pendiente. El portal de MINTRAB (https://librosalarios.mintrabajo.gob.gt/) devolvió HTTP 403 durante la consulta, por lo que no se obtuvo una plantilla oficial vigente para verificar columnas y orden. La referencia localizada fue el Acuerdo Ministerial 124-2019 en https://librosalarios.mintrabajo.gob.gt/complemento/Acuerdo_Ministerial_124-2019.pdf. Se requiere la plantilla que utilizará la empresa antes de presentar una exportación como libro oficial.

## Cobertura actual y brechas

| Dato                           | Fuente disponible                                 | Pendiente                                                                  |
| ------------------------------ | ------------------------------------------------- | -------------------------------------------------------------------------- |
| Empresa y NIT                  | ERP_EMPRESA                                       | Validación del formato oficial y campos empresariales ausentes             |
| Persona y documento            | ERP_PERSONA / ERP_PERSONA_DOCUMENTO               | Regla de selección del documento principal                                 |
| Contratación y salario         | NOM_EMPLEADO / NOM_RELACION_LABORAL               | Regla aprobada de distribución salarial y vigencias históricas del salario |
| Período y días                 | NOM_PERIODO / NOM_MARCAJE                         | Mapeo preciso de jornadas, días remunerados y columnas oficiales           |
| Extras, ausencias y vacaciones | Marcajes y tablas de novedades                    | Cálculo legal aprobado y tratamiento por escenario                         |
| Préstamos/descuentos           | NOM_PRESTAMO / NOM_DESCUENTO_APLICADO / conceptos | Mapeo y clasificación del libro                                            |
| Ingresos/deducciones/líquido   | NOM_NOMINA_DETALLE / NOM_NOMINA_CONCEPTO          | Tasas/bases IGSS e ISR no se calculan automáticamente                      |
| Folios y exportación           | Exportación CSV genérica de listados              | Formato oficial, folios, encabezados y validación de presentación          |

La exportación CSV existente es una consulta de registros; no se etiqueta como libro oficial. Las boletas del portal muestran los totales registrados por empleado.

## Diez casos reproducibles

Se ejecutan con `npm run test:workflow` en un esquema desechable. Cada fila crea una persona, empleado, relación laboral, detalle y conceptos, ejecuta la conciliación y compara el líquido. Los importes se definen explícitamente para probar aritmética; **no son tasas legales, reglas de prorrateo aprobadas ni cálculo automático de novedades**. El caso de ingreso parcial registra una contratación a mitad de mes. Las etiquetas de vacaciones/ausencia describen los conceptos del ejemplo; el flujo real de vacaciones se prueba separadamente en la misma suite. No se agregan IGSS o ISR ficticios.

| Caso                   | Ordinario | Bonificación | Extras | Ausencia | Préstamo | Líquido esperado |
| ---------------------- | --------: | -----------: | -----: | -------: | -------: | ---------------: |
| Mes completo           |      5000 |          250 |      0 |        0 |        0 |             5250 |
| Horas extra diurnas    |      5000 |          250 |    400 |        0 |        0 |             5650 |
| Horas extra nocturnas  |      5000 |          250 |    600 |        0 |        0 |             5850 |
| Ausencia sin goce      |      5000 |          250 |      0 |      200 |        0 |             5050 |
| Vacaciones con goce    |      5000 |          250 |      0 |        0 |        0 |             5250 |
| Cuota de préstamo      |      5000 |          250 |      0 |        0 |      300 |             4950 |
| Ingreso a mitad de mes |      2500 |          125 |      0 |        0 |        0 |             2625 |
| Extras y ausencia      |      5000 |          250 |    400 |      200 |        0 |             5450 |
| Vacaciones y préstamo  |      5000 |          250 |      0 |        0 |      300 |             4950 |
| Combinado con centavos |   5000.25 |          250 | 400.75 |   200.15 |   300.35 |          5150.50 |
