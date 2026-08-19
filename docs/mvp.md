# Alcance funcional de Konea Rebirth

## Propuesta Capstone

Konea demuestra cómo una plataforma universitaria puede reunir comunidad,
colaboración académica y convivencia segura en un solo producto. El proyecto no
es una maqueta: las acciones importantes atraviesan React, una API con permisos
del lado servidor y PostgreSQL persistente.

La pregunta que responde el MVP es:

> ¿Puede una comunidad universitaria descubrir personas, compartir contenido y
> coordinar trabajo grupal con identidad, privacidad y moderación verificables?

## Actores

- **Estudiante:** publica, sigue personas, conversa y colabora.
- **Profesor:** tiene las funciones sociales y puede emitir anuncios.
- **Moderador:** revisa contenido y reportes sin recibir acceso a secretos o
  contraseñas.
- **Administrador:** incluye moderación y eliminación administrativa de posts.
- **DUCO local:** responde al usuario autenticado a partir de sus propias tareas
  pendientes, sin integración de terceros.

## Funciones implementadas

### 1. Identidad y sesión

- Registro con correo, nombre, usuario único y contraseña.
- Inicio y cierre de sesión revocable mediante cookie `HttpOnly`.
- Perfil académico editable: nombre, usuario, biografía, institución, carrera,
  campus, avatar, portada y sitio web.
- Directorio con búsqueda por nombre, usuario, carrera, institución o campus.
- Perfil público con actividad reciente, rol, estadísticas y posts visibles.

### 2. Comunidad

- Publicaciones de tipo `community` o `announcement`.
- Anuncios restringidos a `professor`, `moderator` y `admin`.
- Visibilidad `campus`, `followers` o `public`, aplicada en la API.
- Texto de hasta 2.000 caracteres e imagen opcional.
- Me gusta idempotente, contador de comentarios y contador de compartidos.
- Comentarios y respuestas anidadas, con edición del autor y eliminación por
  autor/moderación.
- Eliminación de posts propios y eliminación administrativa.
- Seguimiento/desseguimiento y notificación al nuevo seguidor.
- Consulta de seguidores, seguidos y posts favoritos mediante API.

### 3. Mensajería y grupos

- Un único chat directo por pareja de usuarios; recrearlo restaura el existente.
- Grupos con nombre, avatar y participantes.
- Roles internos `owner`, `admin` y `member` con validación del lado servidor.
- Alta, cambio de rol, salida o retiro de participantes según permisos.
- Mensajes de texto, imagen, PDF, encuesta y eventos de sistema.
- Etiquetas `important`, `question`, `link`, `delivery`, `resources` y `poll`.
- Búsqueda por texto y filtro por etiqueta.
- Paginación hacia mensajes anteriores y contadores de no leídos.
- Edición del propio mensaje y eliminación por autor o administrador del grupo.
- Actualización periódica por polling para una demostración multiusuario local.

### 4. Colaboración académica

- Tareas dentro de un chat, asignadas solo a participantes activos.
- Título, detalle, fecha, prioridad `low`/`medium`/`high` y estados
  `pending`/`in_progress`/`completed`.
- Edición y eliminación según creador, persona asignada y rol del grupo.
- Encuestas con 2 a 6 opciones, voto único o múltiple y resultados acumulados.
- Códigos personales alfanuméricos de seis caracteres, válidos por cinco
  minutos, de un solo uso y con límite de intentos; al canjearlos se abre o
  recupera un chat directo.

### 5. Actividad, reportes y moderación

- Notificaciones por seguidores, reacciones, comentarios, respuestas,
  mensajes, tareas y acciones de moderación.
- Conteo de no leídas, lectura individual y marcado global.
- Reportes sobre posts, comentarios, chats, mensajes o usuarios en la API.
- Un usuario no puede abrir reportes duplicados sobre el mismo recurso mientras
  uno siga pendiente o en revisión.
- Flujo de reporte `pending` → `reviewing` → `resolved`/`dismissed`.
- Centro de revisión de publicaciones con aprobación o rechazo motivado.
- Reglas locales mínimas de convivencia antes de guardar posts/comentarios.

### 6. DUCO local

- Conversación individual persistida en PostgreSQL.
- Resumen y priorización de tareas pendientes asignadas al usuario.
- Historial recuperable y opción de borrarlo.
- Respuestas determinísticas y transparentes; ningún contenido sale hacia un
  proveedor de IA.

## Reglas de aceptación relevantes

| Escenario                                          | Resultado esperado                                                     |
| -------------------------------------------------- | ---------------------------------------------------------------------- |
| Usuario sin sesión solicita feed/chat              | `401` y ningún dato social                                             |
| Estudiante intenta publicar anuncio                | `403`                                                                  |
| Post solo para seguidores                          | Visible para autor, seguidores y moderación; no para otros estudiantes |
| Segundo Me gusta del mismo usuario                 | No duplica la fila ni el conteo                                        |
| Usuario ajeno consulta un chat                     | `403`/recurso no expuesto                                              |
| Integrante normal administra otro miembro          | Operación rechazada                                                    |
| Persona asignada cambia solo estado de tarea       | Permitido                                                              |
| Voto nuevo en encuesta de opción única             | Reemplaza el voto anterior en transacción                              |
| Código QR expirado/usado por otra persona          | Rechazado                                                              |
| Archivo disfrazado con MIME permitido              | Rechazado por firma binaria                                            |
| Usuario reporta un recurso invisible               | Se responde como no disponible                                         |
| `POSTS_REQUIRE_APPROVAL=true` y publica estudiante | Post `pending` visible al autor y moderación                           |

Estos casos están respaldados por pruebas de integración en `apps/api/src`.

## Guion de demostración sugerido

Para una defensa breve conviene preparar tres cuentas: estudiante A, estudiante
B y moderador; opcionalmente un profesor.

1. Registrar A, completar su perfil y publicar una imagen de comunidad.
2. Ingresar como B, buscar a A, seguirlo, reaccionar y responder un comentario.
3. Abrir un chat directo o canjear el código personal de A.
4. Crear un grupo, enviar un PDF etiquetado, asignar una tarea y votar una
   encuesta.
5. Mostrar cómo aumentan no leídos y notificaciones en la otra sesión.
6. Preguntar a DUCO “organiza mis tareas” y comprobar que usa la tarea creada.
7. Reportar una publicación y, con la cuenta moderadora, revisar el reporte.
8. Con aprobación activada, crear un post como estudiante y resolverlo en el
   centro de moderación.
9. Cerrar sesión y mostrar que las rutas privadas quedan protegidas.

Dos navegadores o una ventana normal y otra privada facilitan la demostración
multiusuario.

## Qué se recuperó del proyecto anterior

Se conservaron la intención de producto, la identidad visual morada y los
flujos útiles de feed, perfiles, conexiones, chat, tareas, encuestas, QR,
notificaciones, moderación y DUCO.

Se reimplementaron sobre PostgreSQL y una API propia porque el proyecto legacy
no contenía un contrato de base de datos reproducible y dependía de servicios
que ya no estaban disponibles. Esto evita presentar como funcional una
integración borrada.

## Qué no se copió

- Secretos o claves antiguas de Supabase/Groq.
- PHP o configuración del hosting anterior.
- Webhooks de n8n, Flowise o endpoints externos de DUCO.
- Botones legacy sin persistencia real, como compartir fuera del navegador o
  quitar miembros mediante `console.log`.
- Datos de producción que ya no existen.

El contador de compartir registra la intención dentro de Konea; copiar el enlace
o invocar la hoja nativa depende del navegador y no equivale a publicar en una
red externa.

## Límites honestos del MVP

- No hay WebSocket: mensajes, no leídos y notificaciones se actualizan mediante
  solicitudes periódicas.
- `campus` no crea aislamiento multi-institución; hoy existe una comunidad
  lógica Konea.
- `public` no implica acceso anónimo porque toda la API social exige sesión.
- Los archivos locales no tienen antivirus, cuotas por usuario ni limpieza
  automática de huérfanos.
- No hay verificación/recuperación de correo, segundo factor o cierre de todas
  las sesiones.
- No hay notificaciones push, búsqueda global indexada ni paginación del feed.
- El filtro local de texto es una defensa básica, no moderación inteligente.
- DUCO no usa un LLM y sus recomendaciones no son asesoría oficial.
- La API admite reportar cinco tipos de recurso; la interfaz puede exponer
  primero los casos de post y comentario.

## Siguiente fase

1. Desplegar API y web con HTTPS y PostgreSQL administrado.
2. Migrar archivos a almacenamiento de objetos con URLs firmadas.
3. Incorporar verificación/recuperación de cuenta y protección CSRF explícita
   si web y API dejan de compartir sitio.
4. Sustituir polling por WebSocket/SSE y añadir notificaciones push.
5. Agregar aislamiento por institución, políticas de retención y auditoría.
6. Integrar IA solo mediante un adaptador configurable, consentimiento y
   evaluación de privacidad; DUCO local debe seguir disponible como fallback.
