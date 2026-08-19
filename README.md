# Konea Rebirth

Konea es una red social universitaria para conectar personas, compartir vida de
campus y colaborar en grupos de estudio. **Konea Rebirth** recupera el alcance
útil del proyecto anterior sobre una base local, portable y verificable, sin
depender de las conexiones eliminadas de Supabase, Hostinger, Flowise, n8n o
Groq.

El resultado es un proyecto Capstone de extremo a extremo: interfaz web, API,
base de datos relacional, autenticación, autorización, archivos, migraciones y
pruebas automatizadas.

## Estado del producto

El repositorio implementa estos dominios:

- **Cuentas y perfiles:** registro, inicio/cierre de sesión, perfil académico,
  avatar, portada, campus, sitio web, presencia reciente y roles.
- **Comunidad:** feed, publicaciones de comunidad o anuncios, visibilidad de
  campus/seguidores/pública, imágenes, Me gusta, contador de compartidos,
  comentarios, respuestas, edición y eliminación según permisos.
- **Personas:** directorio y búsqueda, perfiles públicos, estadísticas,
  publicaciones, seguidores, seguidos y publicaciones favoritas.
- **Mensajería:** chats directos idempotentes, grupos, participantes y roles,
  mensajes de texto, imágenes y PDF, etiquetas, búsqueda, paginación, edición,
  eliminación y contadores de no leídos.
- **Colaboración:** tareas asignables por chat, prioridades y estados;
  encuestas de opción única o múltiple; códigos personales de seis caracteres
  que expiran y abren un chat directo.
- **Actividad y convivencia:** notificaciones, reportes, reglas locales de
  contenido y cola de aprobación de publicaciones para moderación.
- **DUCO local:** historial privado y orientación determinística basada en las
  tareas pendientes del usuario, sin enviar datos a una IA externa.

La API contiene el alcance completo anterior que se decidió rescatar. No se
copiaron secretos, adaptadores rotos ni controles que en el proyecto legacy eran
solo decorativos o terminaban en `console.log`. Consulta el alcance verificable
en [docs/mvp.md](docs/mvp.md).

## Stack

| Capa                   | Tecnología                                                            |
| ---------------------- | --------------------------------------------------------------------- |
| Web                    | React 19, TypeScript y Vite 8                                         |
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
│   └── web/                 # cliente React responsive
├── docs/
│   ├── api.md               # contratos HTTP
│   ├── architecture.md      # decisiones y flujos técnicos
│   └── mvp.md               # alcance funcional para Capstone
├── .local/uploads/          # archivos locales; ignorados por Git
├── compose.yaml             # PostgreSQL de desarrollo
└── .env.example             # variables requeridas, sin secretos
```

## Requisitos

- Node.js 22.12 o superior.
- npm 11 o superior.
- Docker Desktop con backend WSL 2 y virtualización habilitada.
- Git para versionar y colaborar mediante GitHub.

Postman/Insomnia y DBeaver/pgAdmin son útiles, pero no son necesarios para
ejecutar Konea.

## Instalación local en `D:`

Abre PowerShell en la carpeta del proyecto:

```powershell
Set-Location D:\konea-rebirth\Konea-Rebirth
Copy-Item .env.example .env
npm install
npm run db:up
npm run db:migrate
npm run dev
```

Si `.env` ya existe, consérvalo: contiene la configuración local y Git lo
ignora. Docker puede tardar unos segundos en declarar PostgreSQL saludable.

Servicios de desarrollo:

- web: <http://localhost:5173>;
- API: <http://localhost:3000/api/v1>;
- salud: <http://localhost:3000/api/v1/health>;
- salud de PostgreSQL: <http://localhost:3000/api/v1/health/database>.

`npm run dev` mantiene web y API en la misma terminal. También pueden iniciarse
por separado con `npm run dev:web` y `npm run dev:api`.

### Variables de entorno

| Variable                 | Uso                                         | Valor local de referencia |
| ------------------------ | ------------------------------------------- | ------------------------- |
| `POSTGRES_DB`            | Base creada por Compose                     | `konea`                   |
| `POSTGRES_USER`          | Usuario local de PostgreSQL                 | `konea`                   |
| `POSTGRES_PASSWORD`      | Contraseña local                            | reemplazar el ejemplo     |
| `POSTGRES_PORT`          | Puerto publicado por Docker                 | `5432`                    |
| `DATABASE_URL`           | Conexión usada por API y migraciones        | PostgreSQL local          |
| `NODE_ENV`               | `development`, `test` o `production`        | `development`             |
| `API_PORT`               | Puerto HTTP de Express                      | `3000`                    |
| `CORS_ORIGIN`            | Orígenes web permitidos, separados por coma | `http://localhost:5173`   |
| `SESSION_TTL_DAYS`       | Vigencia de una sesión, entre 1 y 30 días   | `7`                       |
| `POSTS_REQUIRE_APPROVAL` | Activa la cola para posts de estudiantes    | `false`                   |
| `VITE_API_URL`           | Prefijo/base consumido por la web           | `/api/v1`                 |

No uses las credenciales de ejemplo en producción ni subas `.env` a GitHub.

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

El comando también admite `student` y `admin`, y se niega a ejecutarse con
`NODE_ENV=production`. Vuelve a iniciar sesión después de cambiar el rol.

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
  carpeta está ignorada por Git y debe respaldarse por separado.
- Cada migración SQL queda versionada en `apps/api/drizzle/`.

No ejecutes `docker compose down --volumes` si deseas conservar la base local.
El MVP todavía no realiza recolección automática de archivos que dejan de estar
referenciados.

## Comandos

| Comando                | Propósito                                     |
| ---------------------- | --------------------------------------------- |
| `npm run dev`          | Inicia API y web con recarga automática       |
| `npm run build`        | Compila todos los workspaces                  |
| `npm run lint`         | Revisa reglas estáticas                       |
| `npm run typecheck`    | Comprueba tipos sin emitir archivos           |
| `npm run test`         | Ejecuta pruebas automatizadas de la API       |
| `npm run format`       | Aplica Prettier al repositorio                |
| `npm run format:check` | Comprueba formato sin modificar               |
| `npm run check`        | Ejecuta lint, tipos, pruebas, build y formato |
| `npm run db:up`        | Inicia PostgreSQL                             |
| `npm run db:down`      | Detiene el Compose conservando datos          |
| `npm run db:logs`      | Sigue los logs de PostgreSQL                  |
| `npm run db:generate`  | Genera SQL desde cambios del esquema          |
| `npm run db:migrate`   | Aplica migraciones pendientes                 |
| `npm run db:studio`    | Abre Drizzle Studio                           |

Antes de una entrega o push ejecuta:

```powershell
npm run check
```

Las pruebas cubren autenticación y sesiones, permisos, perfiles/seguimiento,
feed y moderación, chat/grupos/mensajes/no leídos, tareas, encuestas, QR,
archivos, notificaciones, DUCO y reportes.

## Seguridad y límites conocidos

- Las contraseñas se derivan con `scrypt` y sal aleatoria; no se almacenan en
  texto claro.
- El cliente recibe una cookie `HttpOnly`, `SameSite=Lax`; PostgreSQL guarda
  solo el hash SHA-256 del token y cerrar sesión lo revoca.
- Registro, login y canje de QR tienen límites de intentos.
- Los payloads se validan en la API, CORS usa una lista explícita y los logs
  redactan cookies/autorización.
- Los archivos requieren sesión, tienen máximo 5 MB y se validan por MIME y
  firma binaria; se admiten JPEG, PNG, WebP, GIF y PDF.
- Chat y notificaciones usan polling, no WebSocket ni notificaciones push.
- `public` es una visibilidad preparada en el modelo, pero las rutas sociales
  aún requieren sesión: no existe un feed anónimo.
- El MVP representa una comunidad Konea; `campus` es metadato y no un tenant
  aislado por institución.
- No hay recuperación/verificación de correo, segundo factor, antivirus de
  archivos ni panel de administración de cuentas.
- DUCO es un asistente local de reglas; no es un modelo generativo ni debe
  presentarse como asesoría académica oficial.

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

Usar Supabase Auth, Realtime o Storage es opcional y requeriría adaptadores
explícitos. Migrar PostgreSQL no obliga a reemplazar la autenticación actual.

## Documentación

- [Alcance funcional y guion Capstone](docs/mvp.md)
- [Contratos de la API REST](docs/api.md)
- [Arquitectura, datos y despliegue](docs/architecture.md)
