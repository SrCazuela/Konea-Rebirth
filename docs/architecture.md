# Arquitectura de Konea Rebirth

## Vista general

Konea es una aplicación web de tres capas con límites explícitos:

```text
┌──────────────────────────┐
│ React + Vite             │
│ navegador, puerto 5173   │
└────────────┬─────────────┘
             │ HTTPS/JSON + cookie de sesión
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

La interfaz se organiza alrededor de portal, personas, notificaciones, chat y
DUCO. Estado de carga, vacío y error se resuelve en el cliente, pero toda acción
se vuelve a validar en el servidor.

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
- seguirse a uno mismo;
- duplicar Me gusta o relaciones de seguimiento;
- duplicar una pareja de chat directo;
- duplicar participantes y marcadores de lectura;
- opciones/votos que no pertenecen a una encuesta existente mediante claves
  foráneas.

Las operaciones que deben ser atómicas —registro, creación de grupos,
mensajes/lectura, tareas con evento, encuestas, votos y canje QR— usan
transacciones.

### Archivos locales

El adaptador actual escribe en `.local/uploads/`:

- nombres generados con UUID, no con el nombre proporcionado por el usuario;
- límite de 5 MB;
- lista permitida JPEG/PNG/WebP/GIF/PDF;
- comprobación de cabecera binaria además del MIME;
- descarga solo con sesión y `nosniff`.

La base guarda la URL, nombre y tamaño cuando corresponda. Este límite permite
reemplazar el almacenamiento local por Supabase Storage o S3 sin rediseñar el
dominio social.

## Modelo de datos

Agrupación conceptual de las 19 tablas:

```text
users ──1:1── profiles
  │
  ├──1:N── user_sessions
  ├──N:M── users             (follows)
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
  └──1:N── reports
```

### Enumeraciones de dominio

- usuario: `student`, `professor`, `moderator`, `admin`;
- visibilidad: `campus`, `followers`, `public`;
- contenido: `announcement`, `community`;
- moderación: `pending`, `approved`, `rejected`;
- chat: `direct`, `group`; miembro: `member`, `admin`, `owner`;
- mensaje: `text`, `image`, `file`, `poll`, `system`;
- tarea: prioridad `low`/`medium`/`high` y estado
  `pending`/`in_progress`/`completed`;
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
puede ver su propio contenido. Un post `followers` aparece solo a seguidores;
`campus` y `public` aparecen a miembros autenticados de la comunidad. Moderación
puede consultar todos los estados desde sus rutas específicas.

Al reaccionar, comentar, responder o seguir, la API persiste primero la acción y
crea una notificación para el dueño del recurso, excepto cuando actor y receptor
son la misma persona.

### Chat y no leídos

Un chat directo usa una clave ordenada formada por ambos UUID; por eso dos
solicitudes inversas recuperan la misma conversación. Los grupos mantienen
roles independientes del rol global de Konea.

Cada participante tiene `lastReadAt`. El no leído se calcula comparando mensajes
ajenos posteriores a esa fecha. El cliente marca leído al abrir la conversación
y consulta periódicamente nuevos mensajes; la autorización siempre verifica que
la membresía no esté archivada.

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
misma persona es idempotente; otra persona recibe conflicto.

### Moderación y reportes

`POSTS_REQUIRE_APPROVAL=true` hace que los posts de estudiantes nazcan
`pending`. La API de moderación exige rol `moderator` o `admin`; el rechazo
requiere motivo. Los reportes solo se aceptan si el usuario puede acceder al
recurso y no existe otro abierto equivalente. La revisión asigna el reporte al
moderador que modifica su estado.

### DUCO

DUCO consulta hasta 20 tareas no completadas asignadas al usuario, priorizadas
por fecha, y construye una respuesta local según intención básica (saludo,
resumen o planificación). Pregunta y respuesta se guardan juntas en una
transacción. No existe tráfico hacia un modelo o webhook externo.

## Seguridad

Controles actuales:

- scrypt con comparación de tiempo constante;
- token de sesión aleatorio de 32 bytes y solo su hash en la base;
- cookies `HttpOnly`, `SameSite=Lax`, ruta `/` y `Secure` en producción;
- expiración configurable y revocación de sesión actual;
- límites por origen en registro/login y canje QR;
- Helmet, CORS explícito, JSON máximo de 1 MB y logs redactados;
- validación estricta de bodies, UUID, fechas, consultas y archivos;
- permisos verificados en la API, no confiados al estado de React;
- consultas parametrizadas por Drizzle;
- `.env`, `.local` y artefactos fuera de Git.

Riesgos que requieren trabajo antes de producción:

- protección CSRF explícita si frontend/API se sirven en sitios diferentes;
- recuperación/verificación de cuenta y administración de sesiones;
- análisis antivirus, cuotas, propiedad y ciclo de vida de archivos;
- auditoría durable de decisiones administrativas;
- límites de tasa generales y monitoreo;
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

### DUCO local antes que una clave externa

Ofrece una función útil y auditable aunque las integraciones anteriores hayan
desaparecido. Una futura IA debe entrar mediante un adaptador de servicio, no
desde el navegador ni incrustada en el dominio.

## Entornos y despliegue

### Desarrollo

- Vite sirve React y redirige `/api` a Express.
- Express y Drizzle usan `.env` en la raíz.
- Docker publica PostgreSQL en el puerto configurado.
- datos y archivos permanecen en `D:` con la instalación actual.

### Producción prevista

```text
Navegador ─HTTPS─▶ web estática / reverse proxy
                         │
                         └─HTTPS─▶ API Node persistente
                                         ├─TLS─▶ Supabase PostgreSQL
                                         └─────▶ almacenamiento de objetos
```

Secuencia de migración:

1. crear la base administrada y configurar `DATABASE_URL` con SSL;
2. ejecutar migraciones versionadas desde un job controlado;
3. probar restricciones, índices y zona horaria;
4. sustituir el adaptador de archivos y migrar objetos;
5. desplegar API con `NODE_ENV=production`, secretos, HTTPS y health checks;
6. desplegar la web con `VITE_API_URL` correcto;
7. configurar `CORS_ORIGIN`, dominio de cookie, backups y observabilidad;
8. ejecutar pruebas de humo con una base no productiva antes de importar datos.

Hostinger solo es válido si el plan permite el runtime Node requerido, un
proceso persistente, variables de entorno y salida TLS hacia PostgreSQL. Si solo
ofrece hosting estático, puede alojar la web, pero la API necesitará otro
servicio.

## Observabilidad y calidad

- `/api/v1/health` comprueba el proceso HTTP.
- `/api/v1/health/database` ejecuta una consulta a PostgreSQL.
- `pino-http` registra solicitudes sin cookies ni autorización.
- Vitest/Supertest ejercita contratos y permisos sobre una base de prueba/local.
- `npm run check` reúne lint, tipos, tests, build y formato.

Los contratos concretos están en [api.md](api.md) y el alcance demostrable en
[mvp.md](mvp.md).
