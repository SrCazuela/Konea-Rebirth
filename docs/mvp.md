# Alcance funcional de Konea Rebirth

## Propuesta Capstone

Konea demuestra cómo una plataforma universitaria puede reunir comunidad,
colaboración académica y convivencia segura en un solo producto. El proyecto no
es una maqueta: las acciones importantes atraviesan React, una API con permisos
del lado servidor y PostgreSQL persistente.

La pregunta que responde el MVP es:

> ¿Puede una comunidad universitaria compartir contenido, coordinar trabajo y
> sostener hábitos de estudio sin exponer a sus estudiantes a contactos directos
> no consentidos?

## Actores

- **Estudiante:** publica, crea conexiones recíprocas, conversa y colabora.
- **Profesor:** tiene las funciones sociales y puede emitir anuncios.
- **Moderador:** revisa contenido y reportes sin recibir acceso a secretos o
  contraseñas.
- **Administrador:** incluye moderación y eliminación administrativa de posts.
- **KUCO:** organiza el contexto académico del usuario mediante reglas locales,
  Ollama o OpenAI Luna; toda acción propuesta se valida en la API y requiere
  confirmación humana.
- **FocusBuddy:** acompaña sesiones de concentración y presenta el progreso.
  Web y escritorio usan el chibi oficial de alta resolución y la misma API; el
  avatar no toma decisiones por el estudiante.

## Funciones implementadas

### 1. Identidad y sesión

- Registro con correo, nombre, usuario único y contraseña.
- Inicio y cierre de sesión revocable mediante cookie `HttpOnly`.
- Configuración de cuenta para nombre, usuario y correo, y cambio de contraseña
  con verificación de la contraseña actual y revocación de las otras sesiones.
  Cambiar el usuario de acceso no está permitido desde el formulario de perfil.
- Perfil-portafolio editable: identidad, biografía, institución, carrera,
  campus, formación histórica, proyectos, logros, avatar, portada y sitio web.
- No existe un directorio global de estudiantes.
- Los perfiles se abren desde autores de posts/comentarios, chats o códigos QR.
- Una solicitud unilateral permanece privada; solo la reciprocidad crea una
  conexión y genera notificaciones.

### 2. Comunidad

- Publicaciones de tipo `community` o `announcement`.
- Anuncios restringidos a `professor`, `moderator` y `admin`.
- Visibilidad `campus`, `connections` o `public`, aplicada en la API.
- Texto de hasta 2.000 caracteres e imagen opcional.
- Me gusta idempotente, contador de comentarios y contador de compartidos.
- Comentarios y respuestas anidadas, con edición del autor y eliminación por
  autor/moderación.
- Eliminación de posts propios y eliminación administrativa.
- Lista privada de conexiones; no hay contadores sociales públicos.
- Los posts favoritos son actividad privada de su propietario.

### 3. Mensajería y grupos

- Un único chat directo por pareja conectada; crearlo sin conexión se rechaza.
- Grupos con nombre, avatar y participantes.
- Roles internos `owner`, `admin` y `member` con validación del lado servidor.
- Alta, cambio de rol, salida o retiro de participantes según permisos.
- Mensajes de texto, imagen, PDF, encuesta y eventos de sistema.
- Etiquetas `important`, `question`, `link`, `delivery`, `resources` y `poll`.
- Búsqueda por texto y filtro por etiqueta.
- Paginación hacia mensajes anteriores y contadores de no leídos.
- Edición del propio mensaje y eliminación por autor o administrador del grupo.
- Los mensajes de sistema son inmutables y los nuevos integrantes de un grupo
  solo acceden a mensajes, adjuntos y encuestas creados desde su incorporación,
  con la excepción del propietario original. Los votos usan la misma regla.
- El marcado de lectura acepta el último mensaje visible para no resolver avisos
  de contenido que el cliente todavía no mostró.
- Actualización periódica por polling para una demostración multiusuario local o alojada.

### 4. Agenda y colaboración académica

- Tareas dentro de un chat, asignadas solo a participantes activos.
- Título, detalle, fecha, prioridad `low`/`medium`/`high` y estados
  `pending`/`in_progress`/`completed`.
- Edición y eliminación según creador, persona asignada y rol del grupo.
- Encuestas con 2 a 6 opciones, voto único o múltiple y resultados acumulados.
- Códigos personales alfanuméricos de seis caracteres, válidos por cinco
  minutos, de un solo uso y con límite de intentos; al canjearlos se crea una
  conexión explícita y se abre un chat directo. Reutilizar un código consumido
  no restaura una conexión eliminada ni un chat revocado.
- Materias manuales con código, sección y período, editables o desactivables.
- Pendientes personales con materia opcional, descripción, fecha, prioridad y
  estado; KUCO puede preparar su borrador, pero no confirmarlo.
- Importación de próximos eventos y materias desde el enlace ICS privado de AVA
  Duoc, sin solicitar la contraseña de Blackboard.
- Conector AVA experimental opcional: una extensión MV3 extrae solo el DOM
  visible, exporta un JSON local y exige vista previa y confirmación en Konea;
  nunca recibe credenciales, cookies ni tokens institucionales. La fecha de
  entrega se obtiene de su etiqueta de vencimiento. Los cambios de sección,
  código y semestre en materias importadas se muestran para revisión antes de
  actualizar; las materias manuales quedan protegidas.

### 5. FocusBuddy

- Disponible como pestaña web de Konea (`#focusbuddy`) y como aplicación
  Electron para Windows 0.1.2 con interfaz propia, login y canales local/oficial.
- Métodos Pomodoro 25/5, Pomodoro extendido 50/10, trabajo profundo 90/20,
  Flowtime libre y tiempos personalizados.
- Asociación opcional de una sesión con materia y pendiente propios.
- Una sola sesión activa o pausada por usuario, recuperable al recargar o abrir
  el cliente de escritorio.
- Controles de inicio, pausa, reanudación, término y cancelación con tiempo
  calculado por el servidor y eventos persistentes.
- Heartbeat cada 30 segundos, gracia máxima de 90 segundos y pausa segura en la
  siguiente interacción si el cliente se cerró abruptamente.
- Dashboard con tiempo de hoy, semana y total, sesiones completadas, racha
  actual/máxima, últimos siete días, distribución por materia e historial
  reciente.
- Chibi oficial es el personaje predeterminado en web y escritorio: 35 PNG HQ
  transparentes y 13 escenas compartidas, con flotación y parpadeo según los
  fotogramas disponibles. Kuco sigue como alternativa en los ajustes de escritorio.
- Cuenta en FocusBuddy permite editar nombre, usuario, correo y contraseña con
  los mismos controles de la API. Sus preferencias de ventana y personaje son
  propias del dispositivo.
- Ambos clientes renuevan los datos cada 10 segundos cuando están visibles y
  recuperan el estado de sesión ante acciones concurrentes. Se requiere la
  misma cuenta y API; las bases local y alojada siguen siendo independientes.
- El escritorio oculto conserva el refresco cada 30 segundos si el compañero
  sigue habilitado. La web local abre `konea-focusbuddy-local://open` y la alojada
  `konea-focusbuddy://open`, sin transferir credenciales ni iniciar sesión.

### 6. Actividad, reportes y moderación

- Notificaciones por conexiones recíprocas, reacciones, comentarios, respuestas,
  mensajes, tareas y acciones de moderación.
- Conteo de no leídas, lectura individual y marcado global.
- Reportes sobre posts, comentarios, chats, mensajes o usuarios en la API.
- Un usuario no puede abrir reportes duplicados sobre el mismo recurso mientras
  uno siga pendiente o en revisión.
- Flujo de reporte `pending` → `reviewing` → `resolved`/`dismissed`.
- Centro de revisión de publicaciones con aprobación o rechazo motivado.
- Los moderadores revisan la cola y pueden retirar comentarios; únicamente el
  autor o `admin` puede borrar físicamente una publicación.
- Reglas locales mínimas de convivencia antes de guardar posts/comentarios.
- Archivos con cuota total de 100 MB por cuenta y límites de carga, además de la
  validación de tamaño, MIME, firma y propiedad.

### 7. KUCO

- Conversación individual persistida en PostgreSQL.
- Resumen y priorización de tareas pendientes asignadas al usuario.
- Historial recuperable y opción de borrarlo.
- Proveedor configurable: reglas determinísticas (`local`), IA generativa en el
  equipo (`ollama`) u OpenAI Luna (`openai`).
- Fallback automático a reglas locales si Ollama/OpenAI no responde; la interfaz
  informa qué proveedor produjo realmente la respuesta.
- Interpretación generativa con salida estructurada y acciones validadas por el
  backend antes de mostrarse.
- Borradores de tareas persistentes durante 30 días, recuperables aunque se
  borre la conversación.
- Formulario editable para revisar, confirmar o descartar cada borrador. KUCO no
  crea tareas, envía solicitudes ni contacta personas por sí solo.
- “Mis solicitudes” muestra estados y una cronología persistente de respuestas;
  moderación puede contestar, revisar, resolver, rechazar y reabrir, con una
  explicación obligatoria al cerrar.
- Una regla determinística intercepta menciones explícitas de autolesión o daño
  antes de consultar al proveedor generativo: pregunta por peligro inmediato,
  muestra recursos chilenos de crisis y aclara que Konea no contactó a nadie.
  La solicitud de bienestar sigue siendo secundaria, editable y confirmada por
  el estudiante; Konea no es un servicio de emergencias ni vigilancia continua.

## Reglas de aceptación relevantes

| Escenario                                          | Resultado esperado                                                     |
| -------------------------------------------------- | ---------------------------------------------------------------------- |
| Usuario sin sesión solicita feed/chat              | `401` y ningún dato social                                             |
| Estudiante intenta publicar anuncio                | `403`                                                                  |
| Post solo para conexiones                          | Visible para autor, conexiones y moderación; no para otros estudiantes |
| A solicita conectar con B                          | B no recibe aviso ni conoce el intento                                 |
| B también solicita conectar con A                  | Se crea conexión y ambos reciben notificación                          |
| Usuario sin conexión intenta iniciar chat directo  | `403 CONNECTION_REQUIRED`                                              |
| Segundo Me gusta del mismo usuario                 | No duplica la fila ni el conteo                                        |
| Usuario ajeno consulta un chat                     | `403`/recurso no expuesto                                              |
| Integrante normal administra otro miembro          | Operación rechazada                                                    |
| Persona asignada cambia solo estado de tarea       | Permitido                                                              |
| Voto nuevo en encuesta de opción única             | Reemplaza el voto anterior en transacción                              |
| Código QR expirado/usado por otra persona          | Rechazado                                                              |
| Archivo disfrazado con MIME permitido              | Rechazado por firma binaria                                            |
| Usuario reporta un recurso invisible               | Se responde como no disponible                                         |
| `POSTS_REQUIRE_APPROVAL=true` y publica estudiante | Post `pending` visible al autor y moderación                           |
| KUCO propone guardar una tarea                     | Persiste un borrador; no crea el pendiente sin confirmación            |
| Usuario borra el chat con un borrador activo       | El historial desaparece y el borrador sigue recuperable                |
| Usuario repite `clientRequestId` de sesión         | Recupera la misma sesión, sin duplicarla                               |
| Usuario intenta iniciar dos sesiones               | `409 STUDY_SESSION_ALREADY_CURRENT`                                    |
| Miembro nuevo pide historial anterior del grupo    | No recibe mensajes ni adjuntos previos a `joinedAt`                    |
| Moderador intenta borrar físicamente un post ajeno | `403`; debe usar el flujo de moderación                                |
| Mensaje indica posible autolesión                  | Muestra `*4141`, `131` y `133` antes del formulario y no llama al LLM  |

Estos casos están respaldados por pruebas de integración en `apps/api/src`.

## Guion de demostración sugerido

Para una defensa breve conviene preparar tres cuentas: estudiante A, estudiante
B y moderador; opcionalmente un profesor.

1. Registrar A, completar su perfil y publicar una imagen de comunidad.
2. Ingresar como B, abrir el perfil de A desde un comentario y mandar una
   solicitud de conexión; comprobar que A todavía no recibe notificación.
3. Hacer que A solicite conectar con B y mostrar la conexión mutua, o canjear
   el código personal de A para crearla inmediatamente.
4. Crear un grupo, enviar un PDF etiquetado, asignar una tarea y votar una
   encuesta.
5. Mostrar cómo aumentan no leídos y notificaciones en la otra sesión.
6. Contar a KUCO que hay un examen, pedir guardarlo, revisar el formulario y
   confirmar que recién entonces aparece en próximos pendientes.
7. Preguntar a KUCO “organiza mis tareas” y comprobar que usa la tarea creada.
8. Abrir FocusBuddy, elegir materia/pendiente, iniciar un Pomodoro, pausar,
   reanudar y completar; comprobar que el dashboard y el historial cambian.
9. Descargar el instalador oficial 0.1.2 desde la web publicada e iniciar sesión
   con una cuenta de ese entorno; mostrar la sesión y sus métricas sincronizadas.
   Para la demo local, usar `iniciar-focusbuddy.bat` y una cuenta local.
10. Reportar una publicación y, con la cuenta moderadora, revisar el reporte.
11. Con aprobación activada, crear un post como estudiante y resolverlo en el
    centro de moderación.
12. Cerrar sesión y mostrar que las rutas privadas quedan protegidas.

Dos navegadores o una ventana normal y otra privada facilitan la demostración
multiusuario.

## Qué se recuperó del proyecto anterior

Se conservaron la intención de producto, la identidad visual morada y los
flujos útiles de feed, perfiles, conexiones, chat, tareas, encuestas, QR,
notificaciones, moderación y KUCO. El espacio académico persistente y
FocusBuddy se integraron sobre esa base como evolución del alcance Capstone.

Se reimplementaron sobre PostgreSQL y una API propia porque el proyecto legacy
no contenía un contrato de base de datos reproducible y dependía de servicios
que ya no estaban disponibles. Esto evita presentar como funcional una
integración borrada.

## Qué no se copió

- Secretos o claves antiguas de Supabase/Groq.
- PHP o configuración del hosting anterior.
- Webhooks de n8n, Flowise o endpoints externos de KUCO.
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
- Los archivos locales registran propietario, aplican una cuota de 100 MB y
  controlan lectura por recurso, pero no tienen antivirus ni limpieza automática
  de huérfanos.
- No hay verificación/recuperación de correo ni segundo factor. Cambiar datos
  de acceso o contraseña revoca las otras sesiones; no existe todavía una
  pantalla para inventariar y cerrar sesiones individualmente.
- No hay notificaciones push, búsqueda global indexada ni paginación del feed.
- El filtro local de texto es una defensa básica, no moderación inteligente.
- KUCO puede usar un LLM, pero sus respuestas pueden equivocarse y no son
  asesoría académica o institucional oficial. La API limita las acciones y la
  persona usuaria siempre revisa y confirma.
- La API admite reportar cinco tipos de recurso. La interfaz actual expone
  reportes de publicaciones, comentarios, conversaciones y mensajes; el reporte
  directo de un perfil de usuario todavía no está expuesto.
- FocusBuddy no ejecuta descansos automáticamente. La pausa por pérdida de
  heartbeat se materializa cuando llega la siguiente consulta o transición,
  aunque el tiempo computable ya queda limitado a 90 segundos de gracia.
- El cliente Electron incorpora su interfaz, pero no incluye cola offline ni actualizaciones
  automáticas y no despliega API/PostgreSQL. Solo sincroniza mediante operaciones de API permitidas.
  El instalador oficial sigue sin firma digital. El chibi HQ y Kuco reaccionan a la sesión;
  el seguimiento de ojos mediante el puntero sigue pendiente.
- Los límites de tasa y la concurrencia de KUCO usan memoria local del proceso;
  varias réplicas requerirán un almacén compartido como Redis.

## Siguiente fase

1. Ampliar la validación remota ya aprobada con instalación limpia en otro PC,
   apertura del protocolo, cierre abrupto y recuperación tras una caída de la API.
2. Validar la persistencia y restauración de archivos en el almacenamiento de
   objetos configurado para la demo alojada.
3. Incorporar verificación/recuperación de cuenta y protección CSRF explícita
   si web y API dejan de compartir sitio.
4. Sustituir polling por WebSocket/SSE y añadir notificaciones push.
5. Agregar aislamiento por institución, políticas de retención y auditoría.
6. Evaluar privacidad, costo y calidad de los proveedores generativos, mantener
   el modo local como fallback y ampliar las pruebas de seguridad de KUCO.
7. Añadir un proceso de mantenimiento para materializar sesiones abandonadas
   sin esperar otra consulta y ciclos automáticos configurables de
   concentración/descanso.
8. Integrar el seguimiento del puntero con capas y máscaras para los ojos,
   solicitar cierres propios para las poses que aún no los tienen y definir
   dashboards adicionales a partir de pruebas con estudiantes.
9. Firmar el instalador oficial publicado, preparar actualizaciones verificadas y
   mantener separados los canales local y oficial al publicar nuevas versiones.
10. Mover rate limits y concurrencia a Redis antes de escalar horizontalmente.
