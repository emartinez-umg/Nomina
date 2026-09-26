# Integración de Nómina al ERP

El módulo aporta 35 CRUD de Nómina, 16 maestros compartidos necesarios para Recursos Humanos, dashboard, alta guiada y expediente. Mantiene la estructura Oracle instalada. No implementa autenticación, motor de cálculo fiscal, transferencias bancarias reales ni la operación de Contabilidad/CXC.

## Backend

El proceso independiente es `backend/src/server.js`; la parte reutilizable es el router. Un anfitrión Express puede montarlo con su pool Oracle:

```js
import express from 'express';
import { createNominaRouter } from './nomina/backend/src/app.js';

const app = express();
app.use(express.json());
app.use(
  '/api/nomina',
  createNominaRouter({
    pool: poolDelERP,
    externalMode: 'erp',
  }),
);
```

`poolDelERP` debe usar NLS_NUMERIC_CHARACTERS `.,` en cada sesión, como `backend/src/config/pool.js`. El router adquiere y devuelve conexiones y administra las transacciones de cada petición. Todos los campos numéricos se obtienen como texto. Los identificadores de `externalCatalogs` son configuración confiable de arranque y se validan como identificadores Oracle; nunca se aceptan desde una petición.

Los 16 maestros de RRHH utilizan los campos reales del ERP y se administran desde rutas `erp-*`. Solo ERP_USUARIO y CXC_DTE permanecen como referencias de lectura; `externalCatalogs` permite sobrescribir sus etiquetas. Para adaptar los maestros editables, modifica su contrato compartido y las validaciones, no solo las etiquetas. `ERP_PERSONA` presenta nombres y apellidos para personas físicas y razón social para personas jurídicas. Los nombres y PK referenciados por las FKs originales deben existir y ser accesibles; si están en otro esquema, el DBA debe acordar los grants y nombres calificados de la migración. No se cambia el DDL automáticamente para adivinar el contrato de otros equipos.

Al integrar la sesión real, el ERP debe montar su middleware de permisos antes de este router y asignar `USU_ID_CREA` desde una identidad validada. Si hay aislamiento por empresa o sucursal, ese contexto y su filtro deben incorporarse al DAO antes de habilitar acceso multiempresa: el CRUD actual no constituye una frontera de autorización entre empresas. Se validan además coherencias entre empresa, sucursal, departamento, relación laboral y cuenta del empleado; estas validaciones no sustituyen las políticas de autorización del ERP.

## Frontend

```jsx
import { NominaModule } from './nomina/frontend/src/NominaModule.jsx';

<NominaModule apiBaseUrl="/api/nomina" basePath="/nomina" embedded fetcher={fetchDelERP} />;
```

`fetcher` usa la misma interfaz que `fetch` y permite aplicar la política de sesión del anfitrión. `embedded` conserva la navegación superior específica de Nómina y la integra en el flujo del anfitrión, sin una cabecera fija adicional. La paleta de comandos permite acceder a todas las secciones con el buscador o con `Ctrl+K` / `⌘K`; no se abre sobre formularios activos. La navegación usa rutas bajo `basePath` y respeta atrás/adelante. En un ERP con router React propio, se puede conectar la selección de entidades desde `NominaModule` al router anfitrión sin alterar la API ni los componentes CRUD.

La hoja de estilos incluye Tailwind y los tokens de diseño del mockup. Al incorporar el código a un frontend existente, integra esos tokens y componentes con su sistema de estilos para evitar duplicar Tailwind. La fuente se empaqueta localmente; no hay dependencia de Google Fonts en ejecución.

## Base de datos y migración

1. Acordar los nombres, propietarios, PK y permisos de escritura de los maestros compartidos con sus equipos.
2. Para un esquema nuevo completo, aplicar `db/ERP_ESQUEMA_FINAL.sql`. Para un ERP ya poblado, preparar una migración compatible con su versión; no ejecutar el inicializador completo sobre tablas existentes.
3. Configurar las etiquetas reales mediante `externalCatalogs` o vistas adaptadoras.
4. Configurar el pool y las rutas en el anfitrión.
5. Ejecutar pruebas de integración en una base de ensayo del ERP.

`db/init.sql`, `db/seed.sql`, el hook de Docker y el usuario ficticio son **solo de desarrollo**. `db/stubs.sql` es un archivo histórico que ya no se ejecuta. No ejecutar estos archivos en la base ERP de producción. Cambiar `NOM_EXTERNAL_MODE` solo cambia la etiqueta de entorno: no borra ni crea tablas.

## Decisiones pendientes del dominio

Se respetan las columnas coexistentes de motivo y FK del catálogo. El banco se obtiene exclusivamente de BAN_ID; CBE_BANCO ya no existe. Se conserva la separación entre movimientos y tablas dedicadas; no hay sincronización contable automática. No se inventa una tabla o un estado INACTIVO para períodos o relaciones laborales. Los rangos ISR son parámetros administrables y no incluyen valores legales ni motor de cálculo.

## Contratos actualizados en septiembre de 2026

Las rutas `tipo-comision` y `comision-venta` fueron sustituidas por `tipo-ingreso` e `ingreso-variable`. Las PK son TIN_ID e INV_ID. Las nuevas rutas son `tipo-descuento` y `descuento-aplicado`. Los clientes del ERP deben enviar los nombres nuevos de campos; no se aceptan payloads del esquema anterior.

Los períodos no tienen empresa ni fechas almacenadas: usan NPE_ANIO, NPE_MES y NPE_QUINCENA. La planilla sí requiere EMP_ID. El detalle requiere RLA_ID, y ya no tiene EML_ID. Los salarios se almacenan en los dos campos nuevos de NOM_EMPLEADO; la contratación se encuentra en NOM_RELACION_LABORAL. Las transferencias se vinculan solo a NOD_ID conforme al nuevo script.

## Alta guiada y dashboard

`POST /api/nomina/hr/contrataciones` recibe `{person, employee, relation, email?, phone?}`; puede sustituir `person` por `personId` para una persona existente. El router abre una transacción y hace commit únicamente al guardar todos los registros. Un fallo revierte el alta, incluyendo contactos. Reutilizar la misma persona/empresa se rechaza: debe agregarse una relación al empleado existente. No hay generación automática de códigos de empleado ni un operador asumido por el backend. La interfaz preselecciona el operador solo si la consulta devuelve uno.

`GET /api/nomina/hr/dashboard?company={id}` devuelve indicadores del equipo, novedades pendientes, hasta seis planillas recientes, ocho departamentos y diez expedientes incompletos. Los períodos son un calendario compartido y se muestran sin filtro de empresa. No se suman salarios a través de las relaciones para evitar duplicar remuneraciones de empleados con varios contratos. El resumen de planilla suma los detalles registrados y no calcula obligaciones fiscales.

La interfaz está disponible en `/nomina/dashboard`, `/nomina/alta-empleado`, `/nomina/expediente?empleado={id}` y `/nomina/guia`. Los listados aceptan `filterField`/`filterValue`; el formulario de creación conserva ese contexto. Los catálogos creados desde un formulario se guardan independientemente del alta o formulario principal.
