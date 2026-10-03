# Nómina y base integrada del ERP

Base Oracle 21c con **194 tablas del ERP**, incluidas **35 tablas de Nómina**, más **9 tablas complementarias de seguimiento, accesos y portal**. La interfaz incluye dashboard, alta guiada, expediente de empleados y **51 formularios**: 35 de Nómina y 16 maestros del ERP necesarios para Recursos Humanos. Incluye acceso por usuario, empresa y rol.

Empieza en [Inicio](http://127.0.0.1:5173/nomina/dashboard) y consulta la [guía de Recursos Humanos](docs/guia-recursos-humanos.md), también disponible dentro de la aplicación.

La versión del 11 de septiembre de 2026 sustituye los maestros simulados por las estructuras reales del ERP. El script adjunto se conserva intacto en `db/source/ERP_MAS_NOMINA_COMPLETO.sql`; su versión corregida y ejecutable está en `db/ERP_MAS_NOMINA_CORREGIDO.sql`. Las correcciones de Contabilidad y la migración están descritas en [docs/cambios-2026-09-11.md](docs/cambios-2026-09-11.md).

## Actualización de experiencia de RR. HH.

La mejora del 25 de septiembre incorpora borradores, empresa de trabajo persistente, filtros combinados, exportación, revisión de planillas y novedades, controles de pagos, vacaciones y bajas, pagos de liquidación e historial. Consulta [el detalle y los límites](docs/mejoras-ux-2026-09-25.md).

Para actualizar una base existente, ejecuta `npm run db:workflow` antes de arrancar la nueva API. La migración instala las nueve tablas complementarias (cuatro de seguimiento y cinco nuevas), actualiza restricciones de estados y conserva los registros existentes. Crea `admin.nomina` si no hay un administrador activo; guarda su contraseña temporal en `.nomina-admin-inicial.txt`, con permisos de lectura para el propietario. Cámbiala en el primer ingreso y elimina ese archivo después.

## Instancia actual

- Contenedor: `nomina`, Oracle 21c XE.
- Conexión: `localhost:1521/XEPDB1`.
- Esquema activo tras la migración: `ERP_NOMINA`. Contraseña: `NOM_DB_PASSWORD` de `.env`.
- El esquema anterior `NOMINA` se conserva intacto como respaldo. No se exportaron sus registros a archivos.
- La interfaz está en [http://127.0.0.1:5173/nomina](http://127.0.0.1:5173/nomina); la API en `/api/nomina` del puerto 3001.

```sh
npm run dev
```

## Instalación local nueva

Requisitos: Node.js 22.12 o superior, npm y Docker Compose. La imagen oficial de Oracle XE 21c usa amd64; en Apple Silicon se ejecuta mediante emulación.

```sh
cp .env.example .env
# Configura ORACLE_PWD y NOM_DB_PASSWORD en .env antes de continuar.
# NOM_DB_PASSWORD: 12–64 caracteres, letra inicial; letras, números, _ o #.
npm ci
docker compose up -d
docker compose ps
# Esperar el estado healthy.
npm run db:workflow
npm run dev
```

El primer arranque ejecuta `db/init.sql`: esquema final completo, datos ficticios de desarrollo y catálogos del script. Los IDs fiscales `DEV-*`, direcciones pendientes y documentos `DEV / PRUEBA-*` son ejemplos sin validez fiscal. El usuario antiguo de desarrollo tiene una contraseña deshabilitada. `npm run db:workflow` crea el administrador inicial de Nómina.

`db/stubs.sql` y `db/NOM_tablas_completas.sql` son referencias de la versión anterior; ya no se ejecutan en instalaciones nuevas. Los datos persisten en el volumen de Docker. `docker compose stop` y `docker compose start` permiten detener y reanudar sin eliminar datos.

Para recrear una instancia local **descartable**, borrando todos sus datos y esquemas:

```sh
docker compose down -v
docker compose up -d
```

Este reinicio no es una migración. No lo uses para conservar el esquema anterior.

## Migración desde la versión anterior

```sh
npm run db:migrate:check
npm run db:migrate
```

El ensayo crea un esquema temporal, copia y transforma los datos en memoria, valida las restricciones y lo elimina al terminar. La instalación crea `ERP_NOMINA`, verifica la carga y cambia `.env` solo si todo termina correctamente. Nunca borra ni altera el esquema de origen. Si el origen cambia durante la operación, se cancela la activación. Detén escrituras durante el cambio y reinicia la API después.

El adaptador está preparado para la instancia de desarrollo original. No inventa datos reales de empresas o documentos: si detecta maestros que no son los ejemplos conocidos o datos incompatibles que necesitan decisiones (pagos de liquidación, anticipos en movimientos, relaciones ambiguas), detiene la migración. No sobrescribe un esquema `ERP_NOMINA` existente.

`backups/` contiene la estructura SQL y un manifiesto de conteos, sin exportar registros. El respaldo de datos es el esquema de origen conservado en Oracle. El resultado de instalación se registra en `db/migrations/2026-09-11-result.json`.

## Formularios y API

La navegación usa una barra superior con accesos a Inicio, Personal, Planillas y Asistencia. El botón **Todas las secciones**, el buscador o **Ctrl+K / ⌘K** abren la paleta de comandos con los 51 formularios, el alta de empleados y la guía. Permite buscar sin tildes, filtrar por categoría y navegar con **↑ / ↓**, **Enter** y **Escape**. En móvil, los accesos superiores se pueden desplazar horizontalmente y el buscador permanece visible. Los formularios abiertos mantienen prioridad sobre el atajo.

Se agregaron **Tipos de descuento** y **Descuentos aplicados**. Los formularios de comisiones ahora son **Tipos de ingreso** e **Ingresos variables**. También se actualizaron empleados, relaciones laborales, períodos, planillas, detalles de planilla, ausencias, conceptos y cuentas bancarias.

- Empleado: salario ordinario mensual y bonificación decreto por separado; datos de contratación en relaciones laborales.
- Período: calendario compartido por año, mes y quincena opcional.
- Planilla: empresa y período; detalle asociado a una relación laboral.
- Transferencia: origen obligatorio de detalle de planilla. Los pagos de liquidación se registran desde Revisar liquidación en una tabla de seguimiento separada.
- Ingreso variable: base y porcentaje opcionales.
- Cuenta bancaria y ausencia: banco y tipo de ausencia mediante sus catálogos obligatorios.

Consulta las rutas de Nómina y los maestros de Recursos Humanos en [docs/entidades.md](docs/entidades.md).

| Método | Ruta relativa a `/api/nomina` | Resultado                                  |
| ------ | ----------------------------- | ------------------------------------------ |
| GET    | `/{entidad}`                  | Listado `{rows,total,page,pageSize}`       |
| GET    | `/{entidad}/{id}`             | Registro completo                          |
| POST   | `/{entidad}`                  | Creación, HTTP 201                         |
| PUT    | `/{entidad}/{id}`             | Actualización de campos enviados           |
| DELETE | `/{entidad}/{id}`             | Elimina, inactiva o anula según su esquema |
| GET    | `/lookups/{TABLA}`            | Opciones paginadas con nombre e ID         |
| GET    | `/metadata`                   | Esquema y navegación de Nómina             |
| GET    | `/health`                     | Estado real de Oracle, HTTP 200 o 503      |

Ejemplo: `/api/nomina/empleado?page=1&pageSize=20&q=Ana&sort=EML_CODIGO&direction=asc`. Filtro exacto: `filterField=EML_ACTIVO&filterValue=1`. Las columnas de consulta provienen de listas permitidas; los valores se envían como bind variables. Los importes e IDs viajan como cadenas decimales para preservar precisión. Fechas: `YYYY-MM-DD`; timestamps locales: `YYYY-MM-DDTHH:mm:ss.ffffff`.

Frontend y backend comparten las validaciones de campos y los **50 CHECK de Nómina**. Oracle resuelve UNIQUE, FKs y concurrencia. Un único período ABIERTO se controla por tipo/quincena; la unicidad de planilla es período/empresa.

Los estados de planilla y vacaciones se gestionan mediante sus pantallas de revisión; no se pueden cambiar libremente mediante CRUD. Las transferencias usan PENDIENTE, CONFIRMADA, RECHAZADA y ANULADA. `*_ACTIVO`/`*_ACTIVA` se inactivan con 0; ANULADA/ANULADO se usan solo donde ya existen. Las tablas con estados sin anulación se editan explícitamente y DELETE responde 409. Las demás permiten borrado físico confirmado, sujeto a las FKs.

## Configuración e integración

El backend usa Express y `node-oracledb` Thin con pool; el frontend React, Vite, Tailwind y componentes shadcn/ui basados en Radix. Se concilian los totales de planilla contra sus conceptos. No se calculan tasas ni prestaciones legales, no se realizan desembolsos. La autenticación está activada por defecto. Los parámetros 1.5 de hora extra y 1 de exención se cargan del script proporcionado, sin realizar cálculos legales.

Las credenciales y el tamaño del pool están en `NOM_DB_*`; `ORACLE_PWD` se usa en el contenedor y en tareas administrativas de instalación/prueba. `NOM_API_BASE`, `NOM_CORS_ORIGIN`, `HOST` y `PORT` configuran la API. `VITE_NOM_API_BASE`, `VITE_NOM_BASE_PATH` y `VITE_API_PROXY_TARGET` configuran el frontend. `NOM_EXTERNAL_MODE=erp` identifica los maestros reales; no ejecuta DDL.

El router y el componente principal se pueden montar en el ERP anfitrión: [docs/integracion.md](docs/integracion.md).

## Verificación y generación

```sh
npm test
npm run test:oracle
npm run test:workflow
npm run test:init
npm run build
npm run format:check
```

Las pruebas Oracle crean y eliminan esquemas temporales; no alteran la instancia activa. `test:oracle` verifica 51 formularios y 53 catálogos, el alta atómica, su rollback, duplicados y el aislamiento de las consultas por empresa; `test:workflow` comprueba conciliación, trazabilidad y estados protegidos; `test:init` prueba la instalación SQL limpia, las semillas y su idempotencia. `build` genera `frontend/dist`.

Para regenerar el modelo después de cambiar el SQL:

```sh
npm run db:prepare
npm run db:inspect
npm run db:seeds
npm run schema
```

`db:prepare` aplica las correcciones documentadas; `db:inspect` ejecuta el resultado en un esquema temporal y obtiene los metadatos exactos de Oracle; `db:seeds` genera las semillas; `schema` genera los metadatos de los formularios. `db/ERP_ESQUEMA_FINAL.sql` es el DDL consolidado para instalaciones nuevas, sin modificaciones intermedias ni declaraciones duplicadas.

## Flujo de Recursos Humanos

- `GET /api/nomina/hr/dashboard?company={EMP_ID}`: indicadores reales, importes como texto decimal, pendientes y planillas recientes. El filtro de empresa es opcional.
- `POST /api/nomina/hr/contrataciones`: guarda nueva persona (o `personId` existente), `employee`, `relation` y opcionalmente `email`/`phone` en una sola transacción.
- Los maestros editables tienen rutas `erp-persona`, `erp-empresa`, etc. No se exponen contraseñas. Solo el administrador del sistema accede al mantenimiento de usuarios.
- Los selectores admiten filtros por columnas permitidas (`filter_EMP_ID=...`), creación anidada y reintento de lectura.
- La contratación valida empresa/sucursal/departamento; el detalle de planilla valida la empresa de la relación; la transferencia valida la cuenta del empleado. Estas validaciones complementan el control de acceso del servidor por rol y empresa.

Las pruebas de navegador pueden ejecutarse en una instancia descartable con `node scripts/preview-hr-test.js --auth` (puerto 5174, API 3002). Ctrl+C cierra ambos servicios y elimina su esquema temporal; el acceso ficticio es `qa.preview` / `Nomina-Preview-2026!`, exclusivo del esquema temporal. La aplicación habitual sigue en el puerto 5173.

## Cambios de octubre de 2026

Se conservaron las vistas, los colores, las fuentes y los iconos actuales. Consulta [el estado de los 27 puntos](docs/cambios-pendientes-2026-10-03.md), [el flujo de formularios](docs/flujo-nomina.md) y [la revisión del libro de salarios](docs/revision-libro-salarios.md).

Los tres roles son Administrador del Sistema, Administrador de Nómina y Colaborador. Los colaboradores consultan su información, calendario y recomendaciones propias. Los cambios de rol revocan las sesiones. Las contraseñas usan scrypt y las sesiones cookies HttpOnly; en producción requieren HTTPS.

Las escrituras de la API requieren `X-Nomina-Request: 1`. Selecciona una empresa autorizada con `X-Nomina-Company`. Para editar un registro, toma `__version` de su GET y envíalo en `If-Match`; un borrador obsoleto recibe 409 sin sobrescribir datos. Los borradores se conservan en el navegador por usuario durante 15 días; no se sincronizan entre dispositivos.

La regla de salario automático sigue pendiente de confirmación del ingeniero. Los importes de sueldo y bonificación se capturan por separado. Los valores de fechas, vencimiento de borradores y avisos se configuran en `shared/business-rules.js`.
