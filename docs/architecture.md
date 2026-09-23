# Arquitectura de Konea Rebirth

Los diagramas de componentes, relaciones, secuencias y estados están reunidos
en [diagrams.md](./diagrams.md). La trazabilidad con los objetivos Capstone se
mantiene en [backlog.md](./backlog.md).

## Vista general

Konea usa una SPA compartida por el navegador y un shell Electron, con una API
como única frontera de negocio:

```text
┌─────────────────┐  ┌────────────────────┐
│ Navegador       │  │ Electron           │
│ portal completo │  │ ruta #focusbuddy   │
└────────┬────────┘  └─────────┬──────────┘
         └────────────┬────────┘
                      ▼
┌──────────────────────────┐
│ React + Vite             │
│ SPA, puerto 5173 en dev  │
└────────────┬─────────────┘
             │ HTTP(S)/JSON + cookie de sesión
             ▼
┌──────────────────────────┐       ┌──────────────────────────┐
│ Express + TypeScript     │──────▶│ .local/uploads          │
│ API REST, puerto 3000    │       │ imágenes y PDF locales  │
└────────────┬─────────────┘       └──────────────────────────┘
             │ SQL mediante Drizzle
             ▼
┌──────────────────────────┐
│ PostgreSQL 17            │
│ volumen Docker           │
└──────────────────────────┘
```

El navegador nunca recibe `DATABASE_URL` ni credenciales administrativas. La
API es la autoridad para autenticación, visibilidad, pertenencia a chats,
moderación y demás reglas de negocio.

## Componentes

### Aplicación web

`apps/web` contiene una SPA React responsive. Sus clientes de `src/api`:

- usan `/api/v1` mediante el proxy de Vite en desarrollo;
- envían la cookie con `credentials: include`;
- convierten errores HTTP en un contrato común para la interfaz;
- notifican globalmente la expiración de sesión;
- no contienen secretos ni deciden permisos definitivos.

La interfaz se organiza alrededor de portal, conexiones, notificaciones, chat,
DUCO, espacio académico y FocusBuddy. Estado de carga, vacío y error se resuelve
en el cliente, pero toda acción se vuelve a validar en el servidor.

### Cliente de escritorio FocusBuddy

`apps/focusbuddy` es un shell Electron que carga la ruta `#focusbuddy` de la SPA.
En desarrollo usa `http://localhost:5173` y permite elegir el endpoint mediante
la variable del proceso `FOCUSBUDDY_APP_URL` o `--app-url`. Durante
`npm run dist:focusbuddy`, el endpoint se valida y queda incorporado como recurso
público del instalador. Una aplicación empaquetada ignora variables y argumentos
de runtime: cambiar el servidor exige regenerar el instalador, lo que impide
redirigirlo a una pantalla de phishing desde un acceso directo manipulado. No se
carga desde el `.env` de Express. Las URL remotas requieren HTTPS y HTTP se
reserva para localhost. El cliente no contiene otra base de datos ni duplica las
reglas de las sesiones.

La ventana usa `contextIsolation`, `sandbox`, `nodeIntegration: false`, una
partición persistente propia y bloqueo de segunda instancia. Solo concede vídeo
de cámara al origen de Konea (no micrófono). La navegación fuera del origen
configurado se abre en el navegador del sistema únicamente para HTTPS o HTTP
local. Si no encuentra la web, muestra una pantalla local con reintento. Por
tanto, el instalador actual es un cliente del servicio Konea y no ofrece
funcionamiento offline autónomo.

### API

`apps/api` usa Express 5 y separa:

- `routes/`: contratos HTTP y validación Zod;
- `middleware/`: sesión y autorización por rol;
- `services/`: consultas/enriquecimiento de feed, chat y notificaciones;
- `security/`: contraseñas y sesiones;
- `db/schema.ts`: modelo relacional tipado;
- `drizzle/`: migraciones SQL versionadas.

Los routers se montan bajo `/api/v1`. El manejador final devuelve errores JSON
sin stack trace y conserva logs internos con cabeceras sensibles redactadas.

### PostgreSQL

PostgreSQL es la fuente de verdad para cuentas, contenido y colaboración. Las
restricciones relacionales evitan, entre otros casos:

- correos y usuarios duplicados;
- solicitar conectarse con uno mismo;
- duplicar Me gusta o relaciones de seguimiento;
- duplicar una pareja de chat directo;
- duplicar participantes y marcadores de lectura;
- abrir más de una sesión de estudio activa o pausada por usuario;
- repetir una creación de sesión con el mismo `clientRequestId`;
- opciones/votos que no pertenecen a una encuesta existente mediante claves
  foráneas.

Las operaciones que deben ser atómicas —registro, creación de grupos,
mensajes/lectura, tareas con evento, encuestas, votos, canje QR y transiciones de
estudio— usan transacciones.

### Archivos locales

El adaptador actual escribe en `.local/uploads/`:

- nombres generados con UUID, no con el nombre proporcionado por el usuario;
- límite de 5 MB;
- lista permitida JPEG/PNG/WebP/GIF/PDF;
- comprobación de cabecera binaria además del MIME;
- registro de propietario en PostgreSQL;
- cuota acumulada de 100 MB por usuario, serializada con un bloqueo asesor de
  PostgreSQL, y límites de 20 cargas por usuario/60 por origen cada hora;
- descarga con sesión, `nosniff` y `Cache-Control: private, no-store`, limitada al propietario o a quien pueda ver
  el perfil, proyecto de portafolio, post, chat o reporte que referencia el
  archivo;
- imágenes de perfil, posts y avatares de grupo rechazan archivos PDF.

La base guarda la URL, nombre y tamaño cuando corresponda. Este límite permite
reemplazar el almacenamiento local por Supabase Storage o S3 sin rediseñar el
dominio social.

## Modelo de datos

Agrupación conceptual de las 32 tablas:

```text
users ──1:1── profiles
  │
  ├──1:N── user_sessions
  ├──1:N── uploaded_files
  ├──1:N── connection_intents ──N:1── users
  ├──N:M── users             (connections)
  ├──1:N── posts ──1:N── comments
  │             └──N:M── users (post_likes)
  ├──N:M── chats             (chat_participants)
  │           ├──1:N── messages ──1:0..1── polls
  │           │                              ├── poll_options
  │           │                              └── poll_votes
  │           ├──N:M── users (chat_reads)
  │           └──1:N── tasks
  ├──1:N── qr_codes
  ├──1:N── notifications
  ├──1:N── assistant_messages
  ├──1:N── duco_drafts
  ├──1:N── academic_courses ──1:N── academic_tasks
  ├──1:N── academic_calendar_events
  ├──1:0..1── academic_calendar_syncs
  ├──1:N── ava_dom_imports
  ├──1:N── study_sessions ──1:N── study_session_events
  ├──1:N── support_requests ──1:N── support_request_events
  └──1:N── reports
```

### Enumeraciones de dominio

- usuario: `student`, `professor`, `moderator`, `admin`;
- visibilidad: `campus`, `connections`, `public`;
- contenido: `announcement`, `community`;
- moderación: `pending`, `approved`, `rejected`;
- chat: `direct`, `group`; miembro: `member`, `admin`, `owner`;
- mensaje: `text`, `image`, `file`, `poll`, `system`;
- tarea: prioridad `low`/`medium`/`high` y estado
  `pending`/`in_progress`/`completed`;
- método de estudio: `pomodoro`, `pomodoro_extended`, `deep_work`, `flowtime`,
  `custom`; sesión: `active`, `paused`, `completed`, `cancelled`; evento:
  `start`, `pause`, `resume`, `complete`, `cancel`;
- solicitud institucional: `pending`, `reviewing`, `resolved`, `rejected`;
  evento: `created`, `status_changed`, `response`;
- reporte: `pending`, `reviewing`, `resolved`, `dismissed`.

## Flujos críticos

### Registro y sesión

1. Zod normaliza correo/usuario y valida longitudes.
2. La API deriva la contraseña con scrypt y una sal aleatoria.
3. Usuario y perfil se insertan en una transacción.
4. Se genera un token aleatorio; PostgreSQL recibe solo SHA-256(token).
5. El token original viaja en `konea_session`, cookie `HttpOnly`.
6. Cada ruta privada carga usuario/perfil desde una sesión activa; logout borra
   la fila y la cookie.

### Feed y visibilidad

La consulta de feed aplica estado de moderación y visibilidad en SQL. El autor
puede ver su propio contenido. Un post `connections` aparece solo a conexiones
mutuas;
`campus` y `public` aparecen a miembros autenticados de la comunidad. Moderación
puede consultar todos los estados desde sus rutas específicas.

Al reaccionar, comentar, responder o confirmar una conexión, la API persiste primero la acción y
crea una notificación para el dueño del recurso, excepto cuando actor y receptor
son la misma persona.

### Conexión privada

1. Un perfil solo se descubre desde contenido, un chat existente o un QR; no
   existe una consulta de directorio global.
2. `connection_intents` guarda la intención del solicitante durante 30 días.
3. El destinatario no puede consultar ni recibe notificación sobre esa fila.
4. Si aparece la intención inversa, una transacción bloquea el par canónico,
   crea `connections`, elimina ambas intenciones y notifica a los dos usuarios.
5. Crear chats directos, grupos o añadir participantes exige conexión mutua.
6. Canjear un QR de cinco minutos crea la conexión de forma explícita y abre el
   chat en la misma transacción.

### Chat y no leídos

Un chat directo usa una clave ordenada formada por ambos UUID; por eso dos
solicitudes inversas recuperan la misma conversación. Los grupos mantienen
roles independientes del rol global de Konea.

Cada participante tiene `lastReadAt`. El no leído se calcula comparando mensajes
ajenos posteriores a esa fecha. El cliente puede enviar `lastVisibleMessageId`
para que la API no marque como leído contenido que todavía no llegó a mostrar.
El cliente consulta periódicamente nuevos mensajes; la autorización siempre
verifica que la membresía no esté archivada.

En grupos, un integrante que fue añadido o reincorporado solo puede consultar,
buscar, contar y descargar mensajes/adjuntos creados desde su `joinedAt`; el
propietario original conserva el historial. Los mensajes `system` no se pueden
editar ni eliminar, incluso por un administrador del grupo.

### Encuestas y tareas

Una encuesta es un mensaje `poll` con opciones relacionadas. Al votar, la API
toma un bloqueo transaccional por encuesta/usuario, elimina la selección previa
y registra la nueva; así el voto único se reemplaza sin estados intermedios.

Crear una tarea también inserta un mensaje de sistema en el chat. Solo un
participante activo puede ser asignado. Creador y administradores gestionan el
contenido; la persona asignada puede actualizar su estado.

### Código personal

Crear un código invalida cualquier código activo anterior del usuario. El nuevo
valor tiene seis caracteres y expira en cinco minutos. El canje transaccional lo
reclama una sola persona y crea/restaura el chat directo. Repetir el canje por la
misma persona es idempotente; otra persona recibe conflicto. La generación toma
un bloqueo asesor por propietario para impedir dos códigos vigentes creados en
carreras concurrentes.

### Moderación y reportes

`POSTS_REQUIRE_APPROVAL=true` hace que los posts de estudiantes nazcan
`pending`. La API de moderación exige rol `moderator` o `admin`; el rechazo
requiere motivo. Un moderador puede decidir la cola y retirar comentarios, pero
el borrado físico de una publicación queda limitado a su autor o a `admin`. Los
reportes solo se aceptan si el usuario puede acceder al recurso y no existe otro
abierto equivalente. La revisión asigna el reporte al moderador que modifica su
estado.

### Organización académica y FocusBuddy

AVA dispone de dos caminos explícitos. El feed ICS proporcionado por el
estudiante reemplaza lógicamente el conjunto activo de eventos y materias con
origen `ava`; esas materias son de solo lectura. El conector experimental MV3
exporta el DOM visible a un archivo local: Konea valida y persiste una vista
previa, compara duplicados y exige otra confirmación antes de crear materias
`ava_extension` y pendientes. Repetir una captura es idempotente y una captura
posterior nunca desactiva elementos ausentes. Las materias manuales y las
importadas por extensión pueden editarse o desactivarse. El diseño de seguridad,
permisos y fallback se documenta en [ava-connector.md](./ava-connector.md).

El flujo de una sesión de estudio es:

1. la web obtiene el dashboard académico y `GET /study/overview` en la zona
   horaria del cliente;
2. `POST /study/sessions` valida que materia y tarea pertenezcan al usuario,
   acepta un `clientRequestId` idempotente y crea la sesión `active` junto a un
   evento `start`;
3. el cliente actualiza el cronómetro cada segundo, pero el tiempo autoritativo
   se calcula en la API desde `activeStartedAt` más `focusedSeconds` acumulado;
4. mientras está activa, el cliente envía un `heartbeat` cada 30 segundos; la
   API acumula el segmento y renueva `lastHeartbeatAt` sin crear ruido en el
   historial funcional;
5. cada `pause`, `resume`, `complete` o `cancel` bloquea la fila, valida la
   transición, actualiza las marcas de tiempo y agrega un evento inmutable;
6. solo las sesiones `completed` aportan minutos a las métricas y rachas; las
   canceladas quedan en historial sin sumarse.

La base garantiza como máximo una sesión `active`/`paused` por usuario. El
servidor concede una gracia máxima de 90 segundos desde `lastHeartbeatAt`. Si el
cliente desaparece, el tiempo efectivo queda limitado a esa ventana y la sesión
se pausa al recibir la siguiente consulta o transición. Una tarea programada que
materialice la pausa aun cuando nadie vuelva a consultar sería una mejora de
operación futura, no una condición para mantener correctas las estadísticas.

### DUCO

DUCO usa un adaptador de servidor seleccionado por `DUCO_AI_PROVIDER`:

- `local` aplica reglas determinísticas y también funciona como fallback;
- `ollama` consulta el modelo local definido en `OLLAMA_MODEL`;
- `openai` consulta mediante la Responses API el modelo de `OPENAI_MODEL`, que
  en la configuración de referencia es OpenAI Luna.

La clave y las llamadas al proveedor viven exclusivamente en la API. Con
Ollama el procesamiento generativo permanece en el equipo; con OpenAI se envía
al endpoint configurado el contexto necesario para responder. Si Ollama u
OpenAI falla, el servicio vuelve al modo `local`.

`POST /duco/messages` aplica límites de 30 consultas por usuario y 120 por
origen cada 15 minutos. Una instancia admite cuatro generaciones simultáneas y
solo una por usuario. El iniciador también degrada a `local` si falla la
comprobación de Ollama/OpenAI, sin cambiar el archivo `.env`.
Ollama usa `DUCO_AI_TIMEOUT_MS` (120 segundos por defecto) y OpenAI un límite
independiente más breve, `OPENAI_TIMEOUT_MS` (45 segundos por defecto).

El flujo separa lenguaje de acciones de negocio:

1. la API carga la conversación reciente, tareas pendientes y el último
   borrador de tarea activo del usuario;
2. el proveedor interpreta el mensaje y devuelve JSON sujeto a un esquema
   estricto;
3. el backend valida la intención, descarta acciones no respaldadas por lo que
   dijo el estudiante y aplica reglas determinísticas de seguridad;
4. pregunta y respuesta se guardan juntas en una transacción; una acción
   `create_task` crea o actualiza un `duco_draft`, no una tarea;
5. la web recupera el borrador, permite editarlo y exige una confirmación
   explícita antes de llamar a `POST /duco/tasks`;
6. la confirmación crea `academic_tasks` y cambia el borrador a `confirmed` en
   la misma transacción; descartarlo cambia su estado a `cancelled`.

Los borradores de tareas admiten los estados `collecting_information`,
`ready_for_review`, `confirmed`, `cancelled` y `expired`. Cada uno tiene
`expiresAt` con una vigencia inicial de 30 días. El listado de activos excluye
fechas vencidas. La relación desde el borrador hacia su mensaje de origen usa
`ON DELETE SET NULL`: borrar el historial de conversación no elimina el
borrador ni permite saltarse la revisión humana.

Las solicitudes institucionales mantienen la misma frontera: DUCO puede
preparar un formulario, pero el envío solo ocurre cuando el usuario lo revisa y
confirma mediante la ruta correspondiente. El modelo nunca obtiene acceso
directo a PostgreSQL ni ejecuta botones por cuenta propia.

Las menciones explícitas de autolesión o daño a terceros pasan primero por una
regla determinística, incluso cuando el proveedor seleccionado es OpenAI u
Ollama. DUCO pregunta si existe peligro inmediato y muestra la línea chilena de
prevención del suicidio `*4141` (gratuita desde celulares, 24/7), SAMU `131` y
Carabineros `133`. Estos datos provienen del
[Ministerio de Salud](https://www.minsal.cl/linea-de-atencion-4141-no-estas-solo-no-estas-sola/)
y del
[Gobierno de Chile](https://www.gob.cl/noticias/estas-fiestas-patrias-no-olvides-numeros-emergencia/).
El formulario urgente es un canal adicional y nunca se presenta como reemplazo
de ayuda inmediata ni como una alerta ya enviada.

Después del envío, `support_request_events` conserva una cronología append-only
de creación, cambios de estado y respuestas. El estudiante ve el seguimiento en
“Mis solicitudes”; moderadores y administradores pueden responder, comenzar una
revisión, cerrar con una explicación obligatoria o reabrirla. La actualización
condicionada por el estado anterior evita perder cambios concurrentes y cada
acción humana genera una notificación para el solicitante.

## Seguridad

Controles actuales:

- scrypt con comparación de tiempo constante;
- token de sesión aleatorio de 32 bytes y solo su hash en la base;
- cookies `HttpOnly`, `SameSite=Lax`, ruta `/` y `Secure` en producción;
- expiración configurable y revocación de sesión actual;
- límites por origen en registro/login y canje QR;
- límites de carga, sincronización AVA y consultas de DUCO; cuota de archivos por
  usuario;
- Helmet, CORS explícito, JSON máximo de 1 MB y logs redactados;
- validación de `Origin` para escrituras de navegador y un límite global
  configurable de operaciones, además de los límites específicos más estrictos;
- `TRUST_PROXY_HOPS=0` por defecto, para no confiar en cabeceras de IP reenviadas
  fuera de un proxy conocido;
- validación estricta de bodies, UUID, fechas, consultas y archivos;
- permisos verificados en la API, no confiados al estado de React;
- consultas parametrizadas por Drizzle;
- `.env`, `.local` y artefactos fuera de Git.

Riesgos que requieren trabajo antes de producción:

- token CSRF explícito si en el futuro frontend/API necesitan cookies entre
  sitios (`SameSite=None`); el despliegue de sitio único ya combina
  `SameSite=Lax` y validación de `Origin`;
- recuperación/verificación de cuenta y administración de sesiones;
- análisis antivirus y recolección de archivos huérfanos;
- auditoría durable de decisiones administrativas;
- monitoreo y un almacén compartido para rate limits y concurrencia en un
  despliegue con varias réplicas (el almacén actual vive en cada proceso);
- un proceso de mantenimiento que materialice sesiones abandonadas aunque el
  usuario no vuelva a consultar la API;
- aislamiento real por institución si Konea se vuelve multi-campus;
- gestión de secretos, backups cifrados y política de retención.

## Decisiones de portabilidad

### PostgreSQL propio antes que SDK de proveedor

El dominio usa Drizzle y una URL PostgreSQL estándar. Esto hace reproducible el
proyecto en Docker y permite migrarlo a Supabase, Neon u otro PostgreSQL sin
reescribir rutas. Supabase Auth/Realtime/Storage no son requisitos ocultos.

### API propia antes que acceso directo desde React

Centraliza permisos y evita exponer credenciales. También permite desplegar web
y API juntos o separados.

### Polling antes que infraestructura realtime

Para el Capstone local, polling reduce dependencias y conserva comportamiento
multiusuario demostrable. WebSocket o SSE puede añadirse detrás de los mismos
contratos persistentes.

### Proveedor configurable y acciones validadas

El modo `local` conserva una función útil y auditable sin credenciales. Ollama
permite pruebas generativas en el equipo y OpenAI Luna puede usarse cuando hay
créditos, sin cambiar los contratos del cliente. En los tres modos la API, y no
el modelo ni el navegador, conserva la autoridad sobre persistencia, permisos y
transiciones de estado.

### Una SPA para navegador y Electron

FocusBuddy reutiliza el frontend, los contratos REST y la sesión del dominio en
vez de mantener dos aplicaciones divergentes. El shell de escritorio puede
apuntar a la instancia local o a una URL publicada; empaquetarlo no despliega por
sí mismo React, Express ni PostgreSQL.

## Entornos y despliegue

### Desarrollo

- Vite sirve React y redirige `/api` a Express.
- Express y Drizzle usan `.env` en la raíz.
- Docker publica PostgreSQL solo en `127.0.0.1` y el puerto configurado.
- Express escucha en `API_HOST=127.0.0.1` por defecto; un contenedor o reverse
  proxy puede establecer `API_HOST=0.0.0.0` explícitamente.
- `TRUST_PROXY_HOPS` queda en `0` localmente; solo debe configurarse en `1`
  cuando la API esté directamente detrás de un reverse proxy confiable.
- datos y archivos permanecen en `D:` con la instalación actual.
- `iniciar.bat -FocusBuddy` (o `iniciar-focusbuddy.bat`) prepara Docker,
  migraciones, cuenta demo y proveedor DUCO, levanta API/web y abre Electron una
  vez que ambos healthchecks responden.
- El launcher define `FOCUSBUDDY_DATA_DIR=.local/focusbuddy-desktop`; caché,
  cookies y datos de sesión de Electron permanecen en el disco del proyecto y no
  en el perfil de Windows de `C:`.
- La caché de npm del iniciador se fija en `.npm-cache/`, en el mismo disco del
  proyecto y fuera de Git.

### Producción prevista

```text
Navegador ─HTTPS─┐
Electron  ─HTTPS─┴─▶ web estática / reverse proxy
                              │
                              └─HTTPS─▶ API Node persistente
                                              ├─TLS─▶ PostgreSQL administrado
                                              └─────▶ almacenamiento de objetos
```

Secuencia de migración:

1. crear la base administrada y configurar `DATABASE_URL` con SSL;
2. ejecutar migraciones versionadas desde un job controlado;
3. probar restricciones, índices y zona horaria;
4. sustituir el adaptador de archivos y migrar objetos;
5. desplegar API con `NODE_ENV=production`, secretos, HTTPS y health checks;
6. desplegar la web con `VITE_API_URL` correcto;
7. compilar el instalador con `FOCUSBUDDY_APP_URL` HTTPS y comprobar cookies,
   navegación y actualizaciones;
8. configurar `CORS_ORIGIN`, `TRUST_PROXY_HOPS`, dominio de cookie, backups y
   observabilidad;
9. ejecutar pruebas de humo con una base no productiva antes de importar datos.

Hostinger solo es válido si el plan permite el runtime Node requerido, un
proceso persistente, variables de entorno y salida TLS hacia PostgreSQL. Si solo
ofrece hosting estático, puede alojar la web, pero la API necesitará otro
servicio.

## Observabilidad y calidad

- `/api/v1/health` comprueba el proceso HTTP.
- `/api/v1/health/database` ejecuta una consulta a PostgreSQL.
- `pino-http` registra solicitudes sin cookies ni autorización.
- Vitest/Supertest ejercita contratos y permisos sobre una base de prueba/local.
- `npm run check` reúne lint, tipos, consistencia de migraciones, tests, build y
  formato.
- Las migraciones ya publicadas son inmutables; cada cambio posterior se agrega
  en un nuevo archivo y se valida también contra una base vacía.

Los contratos concretos están en [api.md](api.md) y el alcance demostrable en
[mvp.md](mvp.md).
