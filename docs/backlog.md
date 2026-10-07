# Product backlog y trazabilidad

Este backlog traduce los objetivos definidos para **Konea Rebirth** en historias
demostrables. Los estados describen el repositorio actual, no una promesa de
producción institucional.

## Criterio de estado

- **Hecho**: flujo vertical implementado, persistido, documentado y cubierto al
  menos por pruebas de contrato, dominio o integración.
- **Planificado**: alcance acordado para una iteración posterior.
- **Bloqueado**: requiere autorización o infraestructura externa que el equipo
  no controla.

## Backlog priorizado

| ID    | Prioridad | Historia de usuario                                                                 | Criterio de aceptación principal                                                                             | Estado      |
| ----- | --------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ----------- |
| PB-01 | Must      | Como estudiante quiero crear una cuenta e iniciar/cerrar sesión.                    | Contraseña derivada, cookie revocable `HttpOnly` y rutas privadas con `401`.                                 | Hecho       |
| PB-02 | Must      | Como estudiante quiero mantener un perfil y portafolio verificable.                 | Todos los campos guardan; institución, campus y carrera usan catálogo; imágenes permiten crop.               | Hecho       |
| PB-03 | Must      | Como estudiante quiero conectar sin un directorio que facilite hostigamiento.       | QR/código conecta explícitamente; dos intenciones privadas recíprocas crean la conexión.                     | Hecho       |
| PB-04 | Must      | Como conexión quiero conversar en directo o grupo.                                  | Permisos por membresía, grupo con invitado, mensajes/archivos y reintentos sin duplicados.                   | Hecho       |
| PB-05 | Must      | Como usuario quiero conocer envío, entrega, lectura y actividad pendiente.          | Reloj/uno/dos checks y visto; abrir contenido actualiza badges y notificaciones.                             | Hecho       |
| PB-06 | Must      | Como moderador quiero revisar contenido y reportes sin destruir evidencia.          | Cola por rol, transiciones válidas, motivo de rechazo y sin borrado físico por moderador.                    | Hecho       |
| PB-07 | Must      | Como estudiante quiero organizar materias y próximos pendientes.                    | CRUD propio, estados/prioridad/fecha, materias archivables y tareas enlazables.                              | Hecho       |
| PB-08 | Should    | Como estudiante quiero importar mi calendario AVA sin entregar mi contraseña.       | Feed ICS explícito, URL no persistida, sincronización atómica y eventos cancelados inactivos.                | Hecho       |
| PB-09 | Must      | Como estudiante quiero que DUCO me ayude a organizar, sin realizar entregas por mí. | IA configurable; acción estructurada; borrador editable y confirmación humana obligatoria.                   | Hecho       |
| PB-10 | Must      | Como estudiante quiero seguir mis solicitudes institucionales.                      | Estados, respuestas y cronología append-only visibles para usuario y personal autorizado.                    | Hecho       |
| PB-11 | Must      | Como estudiante quiero medir sesiones con distintos métodos.                        | Pomodoro, extendido, profundo, Flowtime y custom; pausar/reanudar/completar/cancelar.                        | Hecho       |
| PB-12 | Must      | Como estudiante quiero entender cómo distribuyo mi estudio.                         | Hoy/semana/total, rachas, siete días, materias e historial basados en sesiones completadas.                  | Hecho       |
| PB-13 | Must      | Como estudiante quiero usar FocusBuddy como programa descargable.                   | Interfaz Electron local con login; comparte API/cuenta, recupera sesión y no requiere Vite.                  | Hecho       |
| PB-14 | Must      | Como equipo quiero un entorno reproducible y un repositorio público seguro.         | Docker, migraciones, launcher, CI, checks y secretos/artefactos locales ignorados.                           | Hecho       |
| PB-15 | Should    | Como usuario quiero un compañero que reaccione a la sesión en ambos clientes.       | Kuco funciona en web/escritorio; chibi opcional con alfa derivada, pendiente de exportación oficial/estados. | En progreso |
| PB-16 | Should    | Como equipo quiero demostrar Konea desde Internet.                                  | Web/API HTTPS, PostgreSQL/objetos persistentes, backups, CORS/cookies y smoke test.                          | Planificado |
| PB-17 | Should    | Como equipo quiero prevenir regresiones del recorrido completo.                     | E2E automatizado: login, tarea, sesión, pausa, cierre abrupto, recuperación y finalización.                  | Planificado |
| PB-18 | Could     | Como institución quiero sincronización autorizada con sistemas académicos.          | OAuth/API oficial, alcance mínimo y aprobación TI; no scraping de credenciales.                              | Bloqueado   |
| PB-19 | Could     | Como usuario quiero eventos instantáneos sin polling.                               | WebSocket/SSE conserva permisos, cursores e idempotencia actuales.                                           | Planificado |
| PB-20 | Must*     | Como institución quiero operar de forma responsable los casos de bienestar.         | Política humana de atención, consentimiento, retención, horarios y escalamiento aprobados.                   | Bloqueado   |

`PB-20` es obligatorio antes de un piloto real, aunque no bloquea una demostración
con datos ficticios. Konea no debe presentarse como un servicio de emergencias o
de vigilancia continua.

## Trazabilidad de objetivos Capstone

| Objetivo | Incremento verificable                                        | Implementación principal                                                                | Evidencia automatizada                                                         |
| -------- | ------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| O1       | Gestionar asignaturas, actividades y fechas.                  | `Academic.tsx`, rutas `/academic`, importación `/ava-calendar`.                         | `academic.test.ts`, `ics-calendar-service.test.ts`.                            |
| O2       | Ejecutar sesiones, Pomodoro y representar estado con avatar.  | `FocusBuddy.tsx`, `FocusAvatar.tsx`, rutas `/study` e interfaz Electron local.          | `study.test.ts`, `study` web tests y tests `apps/focusbuddy/electron`.         |
| O3       | Sincronizar web/escritorio con API y modelo escalable.        | Express/Drizzle/PostgreSQL, `clientRequestId`, heartbeats y eventos de sesión.          | Migraciones limpias, restricciones SQL y pruebas de idempotencia/concurrencia. |
| O4       | Visualizar estadísticas básicas de estudio.                   | `/study/overview`: hoy, semana, total, rachas, días, cursos e historial.                | Casos de agregación, zona horaria, paginación y abandono en `study.test.ts`.   |
| O5       | Validar calidad, seguridad, documentación y reproducibilidad. | `npm run check`, GitHub Actions, Docker Compose, launcher y documentación bajo `docs/`. | Lint, tipos, migraciones, Vitest/Supertest, build y auditoría runtime en CI.   |

## Definición de terminado

Una historia se mueve a **Hecho** solamente cuando:

1. el flujo visible no contiene botones simulados ni mensajes que afirmen una
   persistencia inexistente;
2. la API valida entrada, pertenencia, rol y transición, incluso si se evita la
   interfaz;
3. los cambios de esquema tienen una migración nueva y aplican desde una base
   vacía;
4. existen pruebas proporcionales al riesgo, incluida una regresión para cada
   error corregido;
5. errores, carga vacía y reintentos tienen un estado visible;
6. el contrato y sus límites quedan documentados;
7. `npm run check` pasa y el diff no incluye secretos ni archivos locales.

## Riesgos de ejecución

| Riesgo                                  | Mitigación actual                                                  | Decisión pendiente                                        |
| --------------------------------------- | ------------------------------------------------------------------ | --------------------------------------------------------- |
| Crecimiento del alcance                 | MVP explícito y backlog por prioridad.                             | Congelar funciones antes de la entrega final.             |
| Dependencia de IA externa               | Modos `local`/Ollama y acciones validadas en backend.              | Presupuesto, evaluación y política de datos.              |
| Integración institucional no autorizada | ICS aportado por usuario; no se guardan credenciales AVA.          | Convenio/API oficial con TI.                              |
| Casos sensibles de acoso o autolesión   | Recursos inmediatos, formulario humano y ninguna alerta falsa.     | Protocolo institucional y responsables reales.            |
| Cierre inesperado de FocusBuddy         | Heartbeat, gracia limitada y recuperación de sesión.               | Job de mantenimiento y notificación nativa.               |
| Diferencia visual web/escritorio        | Derivados transparentes; fuentes y manifiesto preservados.         | Recibir alfa oficial/estados faltantes y portar a la web. |
| Varias instancias de API                | Restricciones/transacciones en PostgreSQL.                         | Redis para límites y concurrencia de IA.                  |
| Repositorio público                     | `.env`/ICS/datos locales ignorados y checklist previo a cada push. | Consentimiento sobre PII de entregables DOCX/PDF.         |
