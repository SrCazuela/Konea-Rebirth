# Konea Rebirth

Konea es una red social universitaria para compartir vida de campus y colaborar
con consentimiento mutuo, minimizando contactos no deseados. **Konea Rebirth** recupera el alcance
útil del proyecto anterior sobre una base local, portable y verificable, sin
depender de las conexiones eliminadas de Supabase, Hostinger, Flowise, n8n o
Groq.

El resultado es un proyecto Capstone de extremo a extremo: interfaz web,
cliente de escritorio FocusBuddy, API, base de datos relacional, autenticación,
autorización, archivos, migraciones y pruebas automatizadas.

## Estado del producto

El repositorio implementa estos dominios:

- **Cuentas y perfiles:** registro, inicio/cierre de sesión y perfil-portafolio
  con formación, proyectos, logros, avatar, portada, campus, sitio web y roles.
- **Comunidad:** feed, publicaciones de comunidad o anuncios, visibilidad de
  campus/conexiones/pública, imágenes, Me gusta, contador de compartidos,
  comentarios, respuestas, edición y eliminación según permisos.
- **Conexiones privadas:** no existe un directorio global. Los perfiles se
  descubren desde publicaciones, comentarios o QR; dos solicitudes privadas y
  recíprocas habilitan la conexión sin notificar intentos unilaterales.
- **Mensajería:** chats directos solo entre conexiones o mediante QR, grupos,
  participantes y roles,
  mensajes de texto, imágenes y PDF, etiquetas, búsqueda, paginación, edición,
  eliminación y contadores de no leídos.
- **Colaboración:** tareas asignables por chat, prioridades y estados;
  encuestas de opción única o múltiple; códigos personales de seis caracteres
  que expiran, crean una conexión y abren un chat directo.
- **Actividad y convivencia:** notificaciones, reportes, reglas locales de
  contenido y cola de aprobación de publicaciones para moderación.
- **DUCO:** asistente de organización con proveedor configurable (`local`,
  Ollama u OpenAI Luna), historial privado, contexto de tareas y borradores
  persistentes que el usuario siempre revisa antes de crear o enviar algo.
- **Organización académica:** calendario AVA importado mediante un enlace ICS,
  materias y próximos pendientes editables, vinculables a sesiones de estudio.
- **FocusBuddy:** centro de concentración disponible dentro de la web y como
  cliente Electron. Incluye Pomodoro, Pomodoro extendido, trabajo profundo,
  Flowtime y tiempos personalizados, pausa/reanudación, historial, rachas y
  paneles por día y asignatura. El avatar animado actual es provisional.

La API contiene el alcance completo anterior que se decidió rescatar. No se
copiaron secretos, adaptadores rotos ni controles que en el proyecto legacy eran
solo decorativos o terminaban en `console.log`. Consulta el alcance verificable
en [docs/mvp.md](docs/mvp.md).

## Stack

| Capa                   | Tecnología                                                            |
| ---------------------- | --------------------------------------------------------------------- |
| Web                    | React 19, TypeScript y Vite 8                                         |
| Escritorio             | Electron 44 y electron-builder                                        |
| API                    | Node.js, Express 5 y TypeScript                                       |
| Datos                  | PostgreSQL 17 y Drizzle ORM                                           |
| Desarrollo             | npm workspaces y Docker Compose                                       |
| Validación y seguridad | Zod, scrypt, cookies `HttpOnly`, Helmet y límites de tasa             |
| Calidad                | Vitest, Supertest, oxlint, TypeScript, Prettier y build de producción |

## Estructura

```text
Konea-Rebirth/
├── apps/
│   ├── api/                 # API REST, reglas, esquema y migraciones
│   ├── web/                 # cliente React responsive
│   └── focusbuddy/          # shell Electron para el espacio de estudio
├── docs/
│   ├── api.md               # contratos HTTP
│   ├── architecture.md      # decisiones y flujos técnicos
│   ├── backlog.md           # historias, criterios y trazabilidad
│   ├── diagrams.md          # diagramas para la defensa técnica
│   ├── focusbuddy.md        # producto web/escritorio y evolución visual
│   ├── mvp.md               # alcance funcional para Capstone
│   └── public-repository-checklist.md # publicación sin secretos
├── .local/uploads/          # archivos locales; ignorados por Git
├── compose.yaml             # PostgreSQL de desarrollo
├── iniciar.bat              # prepara servicios, migraciones, API y web
├── iniciar-focusbuddy.bat   # inicia servicios y abre el cliente Electron
└── .env.example             # variables requeridas, sin secretos
```

## Requisitos

- Node.js 22.12 o superior.
- npm 11 o superior.
- Docker Desktop con backend WSL 2 y virtualización habilitada.
- Ollama con `qwen3.5:4b` si DUCO usa el proveedor local de IA generativa.
- Git para versionar y colaborar mediante GitHub.

Postman/Insomnia y DBeaver/pgAdmin son útiles, pero no son necesarios para
ejecutar Konea. Ollama tampoco es obligatorio: si el proveedor elegido no está
disponible, el iniciador continúa con las reglas locales de DUCO.

## Instalación local en `D:`

### Inicio automático en Windows

Después de crear `.env` e instalar las dependencias por primera vez, ejecuta
`iniciar.bat` con doble clic. El iniciador comprueba las herramientas, abre
Docker Desktop y, cuando corresponde, Ollama si todavía no responden, espera el healthcheck de
PostgreSQL, aplica todas las migraciones pendientes y levanta la API y la web.
Cuando `DUCO_AI_PROVIDER=openai`, también valida la clave y el acceso al modelo
configurado mediante el catálogo de modelos, sin generar texto ni consumir
tokens. Si Konea ya está abierta y ambos servicios responden, el iniciador lo
reconoce como un estado correcto en vez de fallar por los puertos ocupados.
Si solo la API o la web quedó activa, reutiliza el servicio sano y levanta el
que falta.

Para iniciar los mismos servicios y abrir además FocusBuddy como aplicación de
escritorio, usa `iniciar-focusbuddy.bat`. Es equivalente a:

```powershell
.\iniciar.bat -FocusBuddy
```

El cliente espera hasta que API y web respondan antes de abrirse. Conserva su
sesión en un perfil propio de Electron, separado de la sesión del navegador.

Para preparar Docker, la base de datos, las migraciones, la cuenta de desarrollo
y el proveedor de IA sin iniciar la API ni la web, usa:

```powershell
.\iniciar.bat -PrepareOnly
```

En `NODE_ENV=development`, el launcher prepara la cuenta demostrativa
`admin` / `admin`. El script se niega a ejecutarla contra un host PostgreSQL no
local; estas credenciales existen únicamente para la defensa local y nunca
deben replicarse en un despliegue público.

El mismo inicio prepara un conjunto social reproducible con perfiles
ficticios, publicaciones, comentarios, reacciones y anuncios resumidos desde
fuentes oficiales de Duoc UC. Las fotografías e ilustraciones provienen de
Internet y conservan su atribución en
[`docs/demo-content-attribution.md`](docs/demo-content-attribution.md); no se
usan rostros reales como identidades ficticias. Configura
`SEED_SOCIAL_DEMO=false` si necesitas una base local vacía.

El modelo de Ollama no se descarga silenciosamente porque ocupa varios GB. Si
falta el modelo configurado, el iniciador muestra el comando `ollama pull` que
debes ejecutar una sola vez. `Ctrl+C` detiene API y web; PostgreSQL y Ollama
permanecen activos para que el siguiente arranque sea más rápido. Windows puede
preguntar si deseas terminar el trabajo por lotes; responde `S`.

### Inicio manual

Abre PowerShell en la carpeta del proyecto:

```powershell
Set-Location D:\konea-rebirth\Konea-Rebirth
Copy-Item .env.example .env
npm install
npm run db:up
npm run db:migrate
npm run db:seed:dev
npm run db:seed:social
npm run dev
```

Si `.env` ya existe, consérvalo: contiene la configuración local y Git lo
ignora. Docker puede tardar unos segundos en declarar PostgreSQL saludable.

Servicios de desarrollo:

- web: <http://localhost:5173>;
- API: <http://localhost:3000/api/v1>;
- salud: <http://localhost:3000/api/v1/health>;
- salud de PostgreSQL, con sesión autenticada:
  <http://localhost:3000/api/v1/health/database>.

`npm run dev` mantiene web y API en la misma terminal. También pueden iniciarse
por separado con `npm run dev:web` y `npm run dev:api`. Con ambos servicios
activos, `npm run focusbuddy` abre únicamente el cliente de escritorio.

Los procesos de desarrollo se ejecutan con `--no-maglev`. Es una medida de
compatibilidad para evitar el cierre nativo `0xC0000409` observado con Node 24
en determinadas compilaciones preliminares de Windows; no modifica el código
de Konea ni el comportamiento de la aplicación.

### Variables de entorno

| Variable                       | Uso                                            | Valor local de referencia   |
| ------------------------------ | ---------------------------------------------- | --------------------------- |
| `POSTGRES_DB`                  | Base creada por Compose                        | `konea`                     |
| `POSTGRES_USER`                | Usuario local de PostgreSQL                    | `konea`                     |
| `POSTGRES_PASSWORD`            | Contraseña local                               | reemplazar el ejemplo       |
| `POSTGRES_PORT`                | Puerto publicado por Docker                    | `5432`                      |
| `DATABASE_URL`                 | Conexión usada por API y migraciones           | PostgreSQL local            |
| `NODE_ENV`                     | `development`, `test` o `production`           | `development`               |
| `API_HOST`                     | Interfaz donde escucha Express                 | `127.0.0.1`                 |
| `API_PORT`                     | Puerto HTTP de Express                         | `3000`                      |
| `TRUST_PROXY_HOPS`             | Proxies confiables delante de Express          | `0`                         |
| `CORS_ORIGIN`                  | Orígenes web permitidos, separados por coma    | `http://localhost:5173`     |
| `WRITE_RATE_LIMIT_PER_15_MIN`  | Máximo global de escrituras por IP cada 15 min | `600`                       |
| `SESSION_TTL_DAYS`             | Vigencia de una sesión, entre 1 y 30 días      | `7`                         |
| `POSTS_REQUIRE_APPROVAL`       | Activa la cola para posts de estudiantes       | `false`                     |
| `SEED_SOCIAL_DEMO`             | Prepara el contenido social ficticio en local  | `true`                      |
| `DUCO_AI_PROVIDER`             | Proveedor de DUCO: local, Ollama u OpenAI      | `ollama`                    |
| `OLLAMA_BASE_URL`              | Dirección del servicio local de Ollama         | `http://127.0.0.1:11434`    |
| `OLLAMA_MODEL`                 | Modelo local utilizado por DUCO                | `qwen3.5:4b`                |
| `OLLAMA_KEEP_ALIVE`            | Tiempo que Ollama conserva el modelo cargado   | `2m`                        |
| `DUCO_AI_TIMEOUT_MS`           | Tiempo máximo de respuesta de Ollama           | `120000`                    |
| `OPENAI_API_KEY`               | Clave privada; solo cuando se usa OpenAI       | sin valor                   |
| `OPENAI_MODEL`                 | Modelo utilizado con el proveedor OpenAI       | `gpt-5.6-luna`              |
| `OPENAI_BASE_URL`              | Base de la API compatible con OpenAI           | `https://api.openai.com/v1` |
| `OPENAI_TIMEOUT_MS`            | Tiempo máximo de respuesta de OpenAI           | `45000`                     |
| `VITE_API_URL`                 | Prefijo/base consumido por la web              | `/api/v1`                   |
| `VITE_FOCUSBUDDY_DOWNLOAD_URL` | Instalador público HTTPS de FocusBuddy         | sin valor                   |

No uses las credenciales de ejemplo en producción ni subas `.env` a GitHub.
Mantén `TRUST_PROXY_HOPS=0` en local y configúralo en `1` únicamente si la API
queda directamente detrás de un reverse proxy confiable; este valor afecta la IP
que usan los límites de tasa.

Aunque el repositorio sea público, una API key, una contraseña real o un enlace
ICS personal de AVA nunca debe publicarse. Los documentos académicos pueden
incluir autoría y datos que el equipo decida hacer públicos, pero no secretos de
acceso. La lista de comprobación está en
[docs/public-repository-checklist.md](docs/public-repository-checklist.md).

## DUCO y borradores revisables

`DUCO_AI_PROVIDER` permite elegir entre tres modos sin cambiar la interfaz:

- `local`: reglas determinísticas y fallback sin modelo generativo;
- `ollama`: modelo generativo ejecutado en el equipo mediante Ollama;
- `openai`: modelo configurado en `OPENAI_MODEL`, actualmente OpenAI Luna.

Ollama y OpenAI interpretan el contexto y devuelven una respuesta estructurada,
pero no tienen permiso directo para escribir acciones de negocio. La API
valida la intención, descarta acciones que no estén respaldadas por lo dicho
por el estudiante y persiste la propuesta como borrador. La clave de OpenAI
solo vive en la API; nunca se envía al navegador. Si se selecciona `openai`, el
contexto necesario para responder sí se transmite al endpoint configurado.

Los borradores de tareas permanecen en PostgreSQL durante 30 días. El usuario
puede retomarlos aunque borre el historial, revisar y modificar sus campos,
confirmarlos para crear el pendiente o descartarlos. DUCO nunca crea una tarea,
envía una solicitud institucional ni contacta a otra persona por sí solo.

Las solicitudes confirmadas aparecen en “Mis solicitudes” con su cronología de
estados y respuestas. Moderadores y administradores disponen de la misma
trazabilidad en su centro de moderación; resolver o rechazar requiere dejar una
respuesta visible para el estudiante.

Los límites de DUCO son 30 consultas por usuario y 120 por origen cada 15
minutos. Una instancia procesa como máximo cuatro respuestas simultáneas y una
por usuario. Tanto ese control de concurrencia como los contadores de tasa viven
en memoria del proceso actual; un despliegue con varias réplicas necesitará un
almacén compartido, por ejemplo Redis.

## FocusBuddy web y escritorio

La ruta `#focusbuddy` usa la misma API y cuenta de Konea en ambos clientes. Una
sesión puede asociarse a una materia y a un pendiente propios. PostgreSQL admite
solo una sesión `active` o `paused` por usuario, guarda eventos de inicio, pausa,
reanudación, término o cancelación y calcula el tiempo efectivo del lado
servidor. El dashboard muestra tiempo de hoy, semana y total, sesiones
completadas, racha actual/máxima, últimos siete días, distribución por materia e
historial reciente.

Electron es un contenedor del frontend, no una segunda implementación ni una
aplicación autónoma sin servidor. En desarrollo abre
`http://localhost:5173/#focusbuddy`. Al ejecutar `npm run dist:focusbuddy`, la
variable de proceso `FOCUSBUDDY_APP_URL=https://...` queda incorporada como
configuración pública del instalador. Un ejecutable empaquetado ignora
sobrescrituras de URL en runtime para impedir que un acceso directo lo convierta
en una ventana de phishing; cambiar el endpoint requiere regenerarlo. Los
overrides mediante variable o `--app-url=https://...` quedan disponibles solo
en desarrollo. HTTP remoto se rechaza y solo se admite HTTP para localhost. El
build también puede hacerse sin esa variable para una defensa local: queda fijado
a `localhost` y requiere mantener `iniciar.bat` abierto. Hasta contar con
hosting, `iniciar-focusbuddy.bat` es la demostración más directa; un instalador
para otro equipo necesitará web/API publicadas mediante HTTPS. El
shell deshabilita acceso Node y DevTools en el paquete, activa aislamiento de
contexto y sandbox, bloquea ventanas internas, limita la cámara al vídeo y
deriva enlaces seguros al navegador del sistema. El launcher local fija
`FOCUSBUDDY_DATA_DIR=.local/focusbuddy-desktop`, de modo que caché y sesión
quedan junto al proyecto en `D:` en vez de consumir el perfil de usuario en
`C:`.

El temporizador se reconstruye desde marcas de tiempo de la API y se sincroniza
al iniciar, pausar, reanudar, completar o cancelar. Mientras una sesión está
activa, el cliente envía un heartbeat cada 30 segundos. Si deja de recibirlos,
la API limita el tiempo computable a 90 segundos desde el último heartbeat y
pausa la sesión al recibir la siguiente consulta o transición. Así, cerrar el
programa abruptamente no infla las estadísticas indefinidamente. La hoja PNG
4×4 incluida es deliberadamente provisional y se podrá reemplazar por los
sprites animados definitivos sin cambiar el temporizador ni las reglas de
sesión.

## Roles y moderación

| Rol         | Capacidades adicionales                                    |
| ----------- | ---------------------------------------------------------- |
| `student`   | Uso normal de comunidad y colaboración                     |
| `professor` | Puede crear publicaciones de tipo anuncio                  |
| `moderator` | Revisa publicaciones y reportes; puede retirar comentarios |
| `admin`     | Moderación y eliminación administrativa de publicaciones   |

Todos los registros nuevos son `student`. Para preparar cuentas de demostración
en local, con PostgreSQL iniciado:

```powershell
npm run user:role --workspace @konea/api -- --email docente@ejemplo.cl --role professor
npm run user:role --workspace @konea/api -- --email mod@ejemplo.cl --role moderator
```

El comando también admite `student` y `admin`. En producción exige acceso a la
terminal, las credenciales de base y la confirmación explícita
`--confirm-production`; esto permite crear el primer administrador sin exponer
un endpoint público de ascenso. Vuelve a iniciar sesión después de cambiar el
rol.

```powershell
npm run user:role --workspace @konea/api -- --email admin@ejemplo.cl --role admin --confirm-production
```

La configuración predeterminada facilita la demostración:

```dotenv
POSTS_REQUIRE_APPROVAL=false
```

Para demostrar la cola real, cámbiala a `true` y reinicia la API. Los posts
nuevos de `student` quedarán `pending`; profesores, moderadores y administradores
se aprueban directamente. El filtro local de convivencia sigue activo en ambos
modos.

## Persistencia local

- PostgreSQL vive en el volumen Docker `konea-rebirth_postgres_data`; detener el
  contenedor no borra los datos.
- `npm run db:down` detiene y elimina los contenedores de este Compose, pero
  conserva el volumen mientras no se use expresamente `--volumes`.
- Imágenes y PDF se guardan en `.local/uploads/`, en este mismo disco `D:`. La
  carpeta está ignorada por Git y debe respaldarse por separado. PostgreSQL
  registra al propietario y la API autoriza la lectura según el perfil,
  portafolio, post, chat o reporte que referencia cada archivo.
- Cada migración SQL queda versionada en `apps/api/drizzle/`.
- Materias, tareas y sesiones/eventos de FocusBuddy se guardan en PostgreSQL;
  recargar la web o abrir Electron recupera la sesión activa o pausada.
- Al usar `iniciar-focusbuddy.bat`, el perfil local de Electron se guarda en
  `.local/focusbuddy-desktop/`; esta carpeta también está ignorada por Git.
- El iniciador fija la caché de npm en `.npm-cache/`, también dentro del
  proyecto e ignorada por Git, para evitar ocupar innecesariamente `C:`.

No ejecutes `docker compose down --volumes` si deseas conservar la base local.
El MVP todavía no realiza recolección automática de archivos que dejan de estar
referenciados.

## Comandos

| Comando                   | Propósito                                                |
| ------------------------- | -------------------------------------------------------- |
| `npm run dev`             | Inicia API y web con recarga automática                  |
| `npm run focusbuddy`      | Abre FocusBuddy; requiere API y web activas              |
| `npm run dist:focusbuddy` | Genera el instalador Windows de Electron                 |
| `npm run build`           | Compila todos los workspaces                             |
| `npm run lint`            | Revisa reglas estáticas                                  |
| `npm run typecheck`       | Comprueba tipos sin emitir archivos                      |
| `npm run test`            | Ejecuta pruebas de API, web y FocusBuddy                 |
| `npm run format`          | Aplica Prettier al repositorio                           |
| `npm run format:check`    | Comprueba formato sin modificar                          |
| `npm run check`           | Ejecuta lint, tipos, migraciones, tests, build y formato |
| `npm run db:up`           | Inicia PostgreSQL                                        |
| `npm run db:down`         | Detiene el Compose conservando datos                     |
| `npm run db:logs`         | Sigue los logs de PostgreSQL                             |
| `npm run db:generate`     | Genera SQL desde cambios del esquema                     |
| `npm run db:check`        | Valida migraciones y snapshots de Drizzle                |
| `npm run db:migrate`      | Aplica migraciones pendientes                            |
| `npm run db:seed:social`  | Prepara o actualiza el contenido social de demostración  |
| `npm run db:studio`       | Abre Drizzle Studio                                      |

Antes de una entrega o push ejecuta:

```powershell
npm run check
```

Las pruebas cubren autenticación y sesiones, permisos, perfiles/seguimiento,
feed y moderación, chat/grupos/mensajes/no leídos, tareas, encuestas, QR,
archivos, notificaciones, DUCO, reportes y el ciclo de sesiones de estudio.

## Seguridad y límites conocidos

- Las contraseñas se derivan con `scrypt` y sal aleatoria; no se almacenan en
  texto claro.
- El cliente recibe una cookie `HttpOnly`, `SameSite=Lax`; PostgreSQL guarda
  solo el hash SHA-256 del token y cerrar sesión lo revoca.
- Todas las escrituras tienen un límite general configurable; registro, login,
  DUCO, cargas, sincronización AVA y canje de QR aplican además límites más
  estrictos. La carga admite 20 archivos por usuario y 60 por origen cada hora,
  con una cuota acumulada de 100 MB por usuario.
- Los payloads se validan en la API, CORS usa una lista explícita y los logs
  redactan cookies/autorización.
- Los archivos requieren sesión, tienen máximo 5 MB y se validan por MIME y
  firma binaria; se admiten JPEG, PNG, WebP, GIF y PDF. Cada subida pertenece a
  una cuenta y no puede adjuntarse a contenido de otra cuenta.
- Chat y notificaciones usan polling, no WebSocket ni notificaciones push.
- Un miembro nuevo de un grupo no recibe historial ni adjuntos anteriores a su
  incorporación; los mensajes de sistema son inmutables y la lectura puede
  limitarse hasta el último mensaje realmente visible por el cliente.
- `public` es una visibilidad preparada en el modelo, pero las rutas sociales
  aún requieren sesión: no existe un feed anónimo.
- El MVP representa una comunidad Konea; `campus` es metadato y no un tenant
  aislado por institución.
- No hay recuperación/verificación de correo, segundo factor, antivirus de
  archivos ni panel de administración de cuentas.
- Las respuestas generativas de DUCO pueden equivocarse y no constituyen
  asesoría académica o institucional oficial. Las acciones sensibles se
  validan en la API y siempre requieren revisión y confirmación del usuario.
- FocusBuddy aún no ejecuta ciclos automáticos de descanso, no funciona sin la
  web/API y todavía usa el avatar provisional en lugar de los sprites finales.

## Migración futura a Supabase y Hostinger

La arquitectura evita acoplar el dominio a un proveedor:

1. crear un PostgreSQL administrado en Supabase y guardar secretos fuera de
   Git;
2. apuntar `DATABASE_URL` a Supabase con TLS y ejecutar `npm run db:migrate`;
3. copiar archivos de `.local/uploads/` a un almacenamiento persistente y
   reemplazar el adaptador/URLs de carga;
4. compilar la web y desplegarla como contenido estático;
5. desplegar la API en un plan Hostinger (u otro proveedor) que soporte Node.js
   persistente, HTTPS, variables de entorno y conexión saliente a PostgreSQL;
6. configurar `CORS_ORIGIN`, cookies seguras, dominio y copias de respaldo;
7. ejecutar pruebas de humo antes de importar datos de demostración.

El cliente Electron no incorpora una copia estática de la web: para distribuirlo
debe compilarse con `FOCUSBUDDY_APP_URL` apuntando a esa instalación HTTPS y
verificar autenticación, cookies y actualizaciones del instalador.

Usar Supabase Auth, Realtime o Storage es opcional y requeriría adaptadores
explícitos. Migrar PostgreSQL no obliga a reemplazar la autenticación actual.

## Documentación

- [Alcance funcional y guion Capstone](docs/mvp.md)
- [Contratos de la API REST](docs/api.md)
- [Arquitectura, datos y despliegue](docs/architecture.md)
- [Backlog, aceptación y definición de terminado](docs/backlog.md)
- [Diagramas técnicos](docs/diagrams.md)
- [FocusBuddy web, API, escritorio y sprites](docs/focusbuddy.md)
- [Conector AVA experimental y permisos MV3](docs/ava-connector.md)
- [Lista de seguridad para el repositorio público](docs/public-repository-checklist.md)
- [Cliente FocusBuddy para escritorio](apps/focusbuddy/README.md)
