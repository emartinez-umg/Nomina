# as2-proyecto-final

# 🚀 Proyecto Final - Análisis de Sistemas II

Bienvenido al repositorio central de desarrollo del proyecto. Este espacio está gestionado bajo el marco de trabajo **Scrum** y estructurado bajo estándares profesionales de ingeniería de software.

## 👥 Equipo y Roles Especializados
Para optimizar el flujo de trabajo, cada miembro opera en su área de especialización técnica:
* **Scrum Master (Edgar):** Facilitador del marco ágil, administración del Sprint Backlog en Jira y remoción de impedimentos.
* **Product Owner (PO):** Gestión de requerimientos del sistema, definición de Historias de Usuario e integridad de los entregables documentales.
* **Desarrollador (Dev):** Diseño de la arquitectura de software, codificación de la API (Lógica de Negocio) e implementación de las Interfaces de Usuario.
* **Database Administrator (DBA):** Diseño del modelo relacional, integridad de datos, optimización de consultas y control de scripts de base de datos.
* **Quality Assurance (QA):** Diseño de estrategias de pruebas, aseguramiento del cumplimiento de Criterios de Aceptación y reporte de bugs.

---

## 📂 Arquitectura del Repositorio
El árbol de directorios en la rama `develop` se divide de forma técnica según las responsabilidades del equipo:

* 📁 **`docs/`** -> Historias de Usuario, Especificaciones de Requerimientos (SRS), Diagramas UML (Casos de Uso, Clases, Secuencia) y manuales de usuario.
* 📁 **`database/`** -> Gestión del motor de persistencia.
  * 📄 `diagrams/` -> Archivos fuente e imágenes del Modelo Entidad-Relación (DER) y Diccionario de Datos.
  * 📄 `ddl/` -> Scripts de Data Definition Language (Estructura de tablas, alteración de esquemas, llaves primarias/foráneas).
  * 📄 `dml/` -> Scripts de Data Manipulation Language (Cargas masivas, inserts de datos quemados y datos de prueba).
* 📁 **`src/`** -> Código fuente de la aplicación.
  * 📄 `api/` / `backend/` -> Lógica del servidor, controladores, enrutamiento, middleware y conexión a base de datos.
  * 📄 `frontend/` -> Componentes de la Interfaz de Usuario (IU), vistas del cliente, maquetación y estilos.
* 📁 **`tests/`** -> Entorno de control de calidad.
  * 📄 `cases/` -> Matrices de Casos de Prueba (Test Cases) detallando precondiciones y resultados esperados.
  * 📄 `automation/` -> Scripts para pruebas automatizadas (Postman colecciones, Cypress, etc.).
  * 📄 `reports/` -> Reportes de ciclos de prueba, evidencias de ejecución y bitácoras de bugs detectados.

---

## 🌿 Flujo de Trabajo Técnico (Git Flow Emprendedor)
Confiando en el profesionalismo y seriedad de los miembros del equipo, no existen reglas restrictivas bloqueando ramas. El flujo de integración se basa en la autogestión y el siguiente estándar:

1. **Código Base Seguro:** La rama `main` refleja únicamente versiones estables listas para presentar al catedrático. Todo el trabajo diario y los incrementos de software viven en la rama `develop`.
2. **Ciclo de Tareas:** Al iniciar una tarea del Sprint de Jira, se recomienda trabajar en una rama corta descriptiva derivada de `develop` (ej. `feature/login-api` o `database/tablas-usuarios`).
3. **Integración Directa:** Al terminar, se realiza el merge a la rama `develop`. El equipo asume el compromiso ético de subir código limpio, compilable y previamente probado de forma local para no afectar a los demás compañeros.

---

## 🔗 Ecosistema del Proyecto
* 🛠️ **[Tablero de Jira (Sprints y Backlog)](#)** *[(Link)](https://miumg-as2.atlassian.net?continue=https%3A%2F%2Fmiumg-as2.atlassian.net%2Fwelcome%2Fsoftware&atlOrigin=eyJpIjoiMWEyZjZlY2U4NDUwNGM0YmE4NjExODJmNDViMmQyZDkiLCJwIjoiaiJ9)*
* 📂 **[Carpeta Compartida de Google Drive](#)** *[(Link)](https://drive.google.com/drive/folders/1K9qbofvt7rKbA3K8m9ZU0ucBhU6a6iiB?usp=sharing)*


## Módulo de Nómina y Recursos Humanos

Implementación en React y Node.js con Oracle 21c: contratación, expedientes, jornadas, planillas y seguimiento de RR. HH. Las vacaciones acumulan 1.25 días por mes completo y se calculan según la jornada del empleado.

Consulta la [instalación y comandos de Nómina](docs/nomina-README.md), la [guía de Recursos Humanos](docs/guia-recursos-humanos.md) y las [mejoras del flujo](docs/mejoras-ux-2026-09-25.md). El código ejecutable está en `backend/`, `frontend/`, `shared/`, `scripts/` y `db/`; se conservan las carpetas iniciales del equipo.
