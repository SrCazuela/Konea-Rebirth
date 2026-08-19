# API REST de Konea

Contrato verificado contra los routers y clientes de Konea Rebirth. La base de
desarrollo es:

```text
http://localhost:3000/api/v1
```

## Convenciones

- Salvo salud, registro e inicio de sesión, todas las rutas requieren la cookie
  `konea_session`.
- El navegador debe usar `credentials: "include"`; Postman/Insomnia debe
  conservar la cookie recibida en registro/login.
- Los cuerpos normales son JSON con `Content-Type: application/json`.
- Los identificadores son UUID, excepto el código personal QR de seis
  caracteres.
- Fechas/horas se serializan como ISO 8601; `dueDate` usa `YYYY-MM-DD`.
- `201` indica creación, `204` éxito sin body y los demás éxitos usan un objeto
  envolvente, por ejemplo `{ "post": {...} }`.
- Los esquemas de entrada son estrictos: campos desconocidos producen error.
- Los clientes deben tolerar campos adicionales en las respuestas y no depender
  de valores internos no descritos.

### Error común

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Los datos enviados no son válidos.",
    "details": {
      "fields": {
        "content": ["Too small: expected string to have >=1 characters"]
      }
    }
  }
}
```

Estados habituales: `400` validación/regla, `401` sin sesión, `403` permiso,
`404` recurso no visible, `409` conflicto, `410` QR expirado, `413` tamaño,
`415` archivo y `422` contenido rechazado. Los consumidores deben usar
`error.code`, no comparar el texto traducido.

## Formatos compartidos

Los ejemplos muestran los campos útiles para clientes; `null` se usa cuando un
dato opcional no existe.

### Usuario autenticado

```json
{
  "id": "uuid",
  "email": "ana@ejemplo.cl",
  "username": "ana",
  "displayName": "Ana Pérez",
  "role": "student",
  "status": "active",
  "bio": null,
  "institution": null,
  "career": null,
  "avatarUrl": null,
  "coverUrl": null,
  "campus": null,
  "website": null,
  "createdAt": "2026-08-18T20:00:00.000Z"
}
```

Roles: `student | professor | moderator | admin`. Estados:
`active | suspended | deleted`.

### Publicación

```json
{
  "id": "uuid",
  "content": "¿Quién estudia para redes?",
  "imageUrl": "/api/v1/uploads/files/uuid.png",
  "contentType": "community",
  "visibility": "campus",
  "moderationStatus": "approved",
  "moderationReason": null,
  "shareCount": 0,
  "createdAt": "2026-08-18T20:00:00.000Z",
  "updatedAt": "2026-08-18T20:00:00.000Z",
  "author": {
    "id": "uuid",
    "username": "ana",
    "displayName": "Ana Pérez",
    "avatarUrl": null
  },
  "likeCount": 2,
  "commentCount": 1,
  "likedByMe": true,
  "canDelete": true
}
```

`contentType`: `announcement | community`; `visibility`:
`campus | followers | public`; moderación:
`pending | approved | rejected`.

### Comentario

```json
{
  "id": "uuid",
  "content": "Yo me sumo.",
  "parentCommentId": null,
  "createdAt": "2026-08-18T20:02:00.000Z",
  "updatedAt": "2026-08-18T20:02:00.000Z",
  "author": {
    "id": "uuid",
    "username": "benja",
    "displayName": "Benjamín",
    "avatarUrl": null
  },
  "canEdit": true,
  "canDelete": true
}
```

Las respuestas se representan con `parentCommentId`; la API acepta respuestas a
un comentario del mismo post y las devuelve en orden cronológico.

### Persona pública

Incluye `id`, `username`, `displayName`, `bio`, `institution`, `career`,
`campus`, `website`, `avatarUrl`, `coverUrl`, `lastSeenAt`, `role`, `createdAt`,
`followedByMe`, `isMe` y:

```json
{ "stats": { "posts": 4, "followers": 8, "following": 5 } }
```

Nunca incluye correo ni estado/credenciales de la cuenta.

### Chat y participante

Un resumen de chat contiene `id`, `type` (`direct | group`), `name`,
`avatarUrl`, `createdById`, fechas, `myRole`, `participants`, `lastMessage` y
`unreadCount`. `lastMessage` es `null` o contiene `id`, `content`, `type`,
`senderId`, `createdAt`.

```json
{
  "id": "uuid",
  "username": "ana",
  "displayName": "Ana Pérez",
  "avatarUrl": null,
  "lastSeenAt": "2026-08-18T20:00:00.000Z",
  "role": "member",
  "joinedAt": "2026-08-18T19:00:00.000Z"
}
```

Roles de chat: `owner | admin | member`.

### Mensaje

```json
{
  "id": "uuid",
  "chatId": "uuid",
  "content": "Aquí está la pauta",
  "type": "file",
  "fileUrl": "/api/v1/uploads/files/uuid.pdf",
  "fileName": "pauta.pdf",
  "fileSize": 15234,
  "tags": ["resources", "important"],
  "createdAt": "2026-08-18T20:00:00.000Z",
  "updatedAt": "2026-08-18T20:00:00.000Z",
  "sender": {
    "id": "uuid",
    "username": "ana",
    "displayName": "Ana Pérez",
    "avatarUrl": null
  },
  "poll": null
}
```

Tipos: `text | image | file | poll | system`. Etiquetas permitidas:
`important | question | link | delivery | resources | poll`.

### Tarea

```json
{
  "id": "uuid",
  "chatId": "uuid",
  "createdById": "uuid",
  "assignedToId": "uuid",
  "title": "Preparar presentación",
  "description": null,
  "dueDate": "2026-08-25",
  "priority": "high",
  "status": "pending",
  "createdAt": "2026-08-18T20:00:00.000Z",
  "updatedAt": "2026-08-18T20:00:00.000Z"
}
```

Los listados agregan `createdBy` y `assignedTo` con perfil resumido.

### Encuesta

```json
{
  "id": "uuid",
  "messageId": "uuid",
  "chatId": "uuid",
  "createdById": "uuid",
  "question": "¿Qué día nos reunimos?",
  "allowMultiple": false,
  "createdAt": "2026-08-18T20:00:00.000Z",
  "options": [
    {
      "id": "uuid",
      "pollId": "uuid",
      "label": "Viernes",
      "position": 0,
      "voteCount": 2,
      "votedByMe": true
    }
  ],
  "voteCount": 2
}
```

`voteCount` cuenta selecciones, por lo que en una encuesta múltiple puede ser
mayor que el número de votantes.

## Servicio y autenticación

| Método | Ruta               | Sesión   | Entrada                                    | Respuesta                                   |
| ------ | ------------------ | -------- | ------------------------------------------ | ------------------------------------------- |
| `GET`  | `/`                | No       | —                                          | `{name, version}`                           |
| `GET`  | `/health`          | No       | —                                          | `{status, service, timestamp}`              |
| `GET`  | `/health/database` | No       | —                                          | `{status, database:{connected, latencyMs}}` |
| `POST` | `/auth/register`   | No       | `{email, password, username, displayName}` | `201 {user}` + cookie                       |
| `POST` | `/auth/login`      | No       | `{email, password}`                        | `{user}` + cookie                           |
| `GET`  | `/auth/me`         | Sí       | —                                          | `{user}`                                    |
| `POST` | `/auth/logout`     | Opcional | —                                          | `204`, revoca la cookie si existe           |

Registro: contraseña de 10 a 128 caracteres; usuario de 3 a 30, en minúsculas,
con letras ASCII, números, punto o guion bajo. Registro y login comparten un
límite de 20 solicitudes cada 15 minutos por origen.

## Feed, reacciones y comentarios

| Método   | Ruta                                 | Entrada                       | Respuesta/efecto                       |
| -------- | ------------------------------------ | ----------------------------- | -------------------------------------- |
| `GET`    | `/posts`                             | —                             | `{posts: Post[]}`, máximo 50           |
| `POST`   | `/posts`                             | `CreatePost`                  | `201 {post}`                           |
| `DELETE` | `/posts/:postId`                     | —                             | `204`; autor o `admin`                 |
| `POST`   | `/posts/:postId/likes`               | —                             | `{liked:true, likeCount}`; idempotente |
| `DELETE` | `/posts/:postId/likes`               | —                             | `{liked:false, likeCount}`             |
| `GET`    | `/posts/:postId/comments`            | —                             | `{comments: Comment[]}`                |
| `POST`   | `/posts/:postId/comments`            | `{content, parentCommentId?}` | `201 {comment}`                        |
| `PATCH`  | `/posts/:postId/comments/:commentId` | `{content}`                   | `{comment}`; solo autor                |
| `DELETE` | `/posts/:postId/comments/:commentId` | —                             | `204`; autor/moderación                |
| `POST`   | `/posts/:postId/shares`              | —                             | `{shareCount}`                         |

`CreatePost`:

```json
{
  "content": "Feria de proyectos este jueves",
  "contentType": "announcement",
  "visibility": "campus",
  "imageUrl": "/api/v1/uploads/files/uuid.png"
}
```

- `content`: 1–2.000 caracteres.
- `contentType` y `visibility` son opcionales; defaults `community` y `campus`.
- `imageUrl` puede ser URL absoluta o ruta local exacta de uploads.
- Solo profesor/moderación/admin puede crear `announcement`.
- Compartir incrementa un contador; no crea una publicación nueva ni registra
  usuarios únicos.

## Perfil y personas

| Método   | Ruta                       | Entrada               | Respuesta                              |
| -------- | -------------------------- | --------------------- | -------------------------------------- |
| `PATCH`  | `/profile`                 | campos de perfil      | `{user}`                               |
| `GET`    | `/users?q=texto`           | `q` opcional, máx. 80 | `{users: PublicUser[]}`, máx. 50       |
| `GET`    | `/users/:userId`           | —                     | `{user, posts}`                        |
| `GET`    | `/users/:userId/followers` | —                     | `{users}`                              |
| `GET`    | `/users/:userId/following` | —                     | `{users}`                              |
| `GET`    | `/users/:userId/likes`     | —                     | `{posts}` visibles para quien consulta |
| `POST`   | `/users/:userId/follow`    | —                     | `{followed:true, followersCount}`      |
| `DELETE` | `/users/:userId/follow`    | —                     | `{followed:false, followersCount}`     |

Todos los campos de `PATCH /profile` son opcionales:

```json
{
  "username": "ana.p",
  "displayName": "Ana Pérez",
  "bio": "Estudiante de informática",
  "institution": "Instituto Ejemplo",
  "career": "Informática",
  "avatarUrl": "https://cdn.example/avatar.png",
  "coverUrl": null,
  "campus": "Santiago",
  "website": "https://ana.example"
}
```

Texto vacío se normaliza a `null` en campos opcionales. Avatar, portada y sitio
web aceptan URL absoluta o `null` en este contrato. El seguimiento es
idempotente y no permite seguir la propia cuenta.

## Chats y participantes

| Método   | Ruta                                  | Entrada                               | Respuesta/permiso                         |
| -------- | ------------------------------------- | ------------------------------------- | ----------------------------------------- |
| `GET`    | `/chats`                              | —                                     | `{chats}`, máximo 50                      |
| `GET`    | `/chats/unread-count`                 | —                                     | `{unreadCount}` total                     |
| `POST`   | `/chats/direct`                       | `{userId}`                            | `200/201 {chat, created}`                 |
| `POST`   | `/chats/groups`                       | `{name, participantIds?, avatarUrl?}` | `201 {chat}`                              |
| `GET`    | `/chats/:chatId`                      | —                                     | `{chat}` con participantes/no leídos      |
| `PATCH`  | `/chats/:chatId`                      | `{name?, avatarUrl?}`                 | `{chat}`; manager y solo grupo            |
| `GET`    | `/chats/:chatId/participants`         | —                                     | `{participants}`                          |
| `POST`   | `/chats/:chatId/participants`         | `{userId, role?}`                     | `201 {participants}`; manager             |
| `PATCH`  | `/chats/:chatId/participants/:userId` | `{role}`                              | `{participants}`; manager                 |
| `DELETE` | `/chats/:chatId/participants/:userId` | —                                     | `204`; salida propia o retiro por manager |

Para grupos, `name` admite 1–120 caracteres, `participantIds` hasta 99 UUID y
`avatarUrl` una URL absoluta/ruta local o `null`. Al agregar/cambiar un rol solo
se admite `member | admin`; el dueño es inmutable. Un dueño con otros
participantes no puede salir y un chat directo no admite editar miembros.

## Mensajes y lectura

| Método   | Ruta                                 | Entrada             | Respuesta/permiso               |
| -------- | ------------------------------------ | ------------------- | ------------------------------- |
| `GET`    | `/chats/:chatId/messages`            | query de página     | `{messages, pageInfo}`          |
| `POST`   | `/chats/:chatId/messages`            | `SendMessage`       | `201 {message}`                 |
| `PATCH`  | `/chats/:chatId/messages/:messageId` | `{content?, tags?}` | `{message}`; autor, no encuesta |
| `DELETE` | `/chats/:chatId/messages/:messageId` | —                   | `204`; autor/manager            |
| `POST`   | `/chats/:chatId/read`                | —                   | `{readAt, unreadCount:0}`       |

Query de listado:

- `limit`: 1–50, default 20;
- `before`: fecha/hora ISO con zona, exclusiva;
- `q`: búsqueda en contenido, máximo 100;
- `tag`: una etiqueta permitida.

La respuesta ordena la página de antiguo a nuevo:

```json
{
  "messages": [],
  "pageInfo": {
    "hasMore": false,
    "nextBefore": null
  }
}
```

`SendMessage`:

```json
{
  "content": "Revisa este documento",
  "type": "file",
  "fileUrl": "/api/v1/uploads/files/uuid.pdf",
  "fileName": "informe.pdf",
  "fileSize": 48192,
  "tags": ["resources"]
}
```

- `type` default `text`; este endpoint acepta `text | image | file`.
- Texto: `content` obligatorio, hasta 4.000.
- Imagen/archivo: `fileUrl` obligatorio; `fileName` hasta 255 y `fileSize` hasta
  10 MB en metadatos. El endpoint local de carga tiene un límite más estricto de
  5 MB.
- Crear/editar devuelve la fila base con `senderId`; el listado agrega `sender`
  y `poll`.

## Tareas

| Método   | Ruta                           | Entrada          | Respuesta/permiso      |
| -------- | ------------------------------ | ---------------- | ---------------------- |
| `GET`    | `/chats/:chatId/tasks`         | —                | `{tasks}` enriquecidas |
| `POST`   | `/chats/:chatId/tasks`         | `CreateTask`     | `201 {task}`           |
| `PATCH`  | `/chats/:chatId/tasks/:taskId` | campos parciales | `{task}`               |
| `DELETE` | `/chats/:chatId/tasks/:taskId` | —                | `204`; creador/manager |

```json
{
  "assignedToId": "uuid opcional; default usuario actual",
  "title": "Preparar diapositivas",
  "description": null,
  "dueDate": "2026-08-25",
  "priority": "medium"
}
```

La persona asignada debe ser participante activo. Creador/manager puede editar
todos los campos; la persona asignada solo puede enviar un cambio compuesto
exclusivamente por `status`.

## Encuestas

| Método   | Ruta                   | Entrada                               | Respuesta            |
| -------- | ---------------------- | ------------------------------------- | -------------------- |
| `POST`   | `/chats/:chatId/polls` | `{question, options, allowMultiple?}` | `201 {poll}`         |
| `GET`    | `/polls/:pollId`       | —                                     | `{poll}`             |
| `POST`   | `/polls/:pollId/votes` | `{optionIds}`                         | `{poll}` actualizado |
| `DELETE` | `/polls/:pollId/votes` | —                                     | `{poll}` actualizado |

Pregunta: 1–80 caracteres. Opciones: 2–6 valores únicos, cada uno de 1–40.
`allowMultiple` default `false`. Votar reemplaza todas las selecciones anteriores
del usuario; una encuesta simple exige exactamente un UUID.

## Códigos personales

| Método   | Ruta                 | Entrada  | Respuesta                                       |
| -------- | -------------------- | -------- | ----------------------------------------------- |
| `GET`    | `/qr-codes/current`  | —        | `{qrCode}` o `{qrCode:null}`                    |
| `POST`   | `/qr-codes/personal` | —        | `201 {qrCode}`; invalida el anterior            |
| `DELETE` | `/qr-codes/current`  | —        | `204`                                           |
| `POST`   | `/qr-codes/redeem`   | `{code}` | `200/201 {chatId, created, redemptionRepeated}` |

Un QR contiene `id`, `ownerId`, `code`, `expiresAt`, `createdAt`, `usedAt` y
`usedById`. El código es alfanumérico, se normaliza a mayúsculas, vence en cinco
minutos y el canje está limitado a 30 intentos cada 15 minutos por origen.

## Archivos

| Método | Ruta                       | Entrada                                   | Respuesta                        |
| ------ | -------------------------- | ----------------------------------------- | -------------------------------- |
| `POST` | `/uploads/files`           | `multipart/form-data`, campo único `file` | `201 {file}`                     |
| `GET`  | `/uploads/files/:fileName` | —                                         | binario con MIME y caché privada |

```json
{
  "file": {
    "name": "uuid.png",
    "originalName": "campus.png",
    "mimeType": "image/png",
    "size": 15321,
    "url": "/api/v1/uploads/files/uuid.png"
  }
}
```

Máximo 5 MB; formatos `image/jpeg`, `image/png`, `image/webp`, `image/gif` y
`application/pdf`. La API valida MIME y firma. Tanto carga como lectura exigen
sesión.

## Notificaciones

| Método  | Ruta                                  | Entrada | Respuesta                                  |
| ------- | ------------------------------------- | ------- | ------------------------------------------ |
| `GET`   | `/notifications`                      | —       | `{notifications, unreadCount}`, últimas 50 |
| `GET`   | `/notifications/unread-count`         | —       | `{unreadCount}`                            |
| `PATCH` | `/notifications/:notificationId/read` | —       | `{notification}`                           |
| `POST`  | `/notifications/read-all`             | —       | `{updated:true}`                           |

Una notificación contiene `id`, `type`, `title`, `body`, `href`, `resourceId`,
`readAt`, `createdAt` y `actor` resumido o `null`. Tipos:
`follow | like | comment | reply | message | task | moderation`.

`href` usa referencias internas como `user:<uuid>`, `post:<uuid>`,
`chat:<uuid>` o `report:<uuid>`; no debe abrirse como URL externa.

## DUCO local

| Método   | Ruta             | Entrada                   | Respuesta                                            |
| -------- | ---------------- | ------------------------- | ---------------------------------------------------- |
| `GET`    | `/duco/messages` | —                         | `{messages}`, hasta 100 en orden cronológico         |
| `POST`   | `/duco/messages` | `{content}` o `{message}` | `201 {userMessage, assistantMessage, openTaskCount}` |
| `DELETE` | `/duco/messages` | —                         | `{deletedCount}`                                     |

Cada mensaje contiene `id`, `role` (`user | assistant`), `content` y
`createdAt`. La entrada admite 1–2.000 caracteres. DUCO responde localmente a
saludos y consultas de tareas/organización usando tareas no completadas del
usuario; no llama a una API externa.

## Reportes

| Método  | Ruta                 | Sesión/rol | Entrada         | Respuesta             |
| ------- | -------------------- | ---------- | --------------- | --------------------- |
| `POST`  | `/reports`           | Sesión     | `CreateReport`  | `201 {report}`        |
| `GET`   | `/reports?status=`   | Moderación | estado opcional | `{reports}`, máx. 100 |
| `PATCH` | `/reports/:reportId` | Moderación | `{status}`      | `{report}`            |

```json
{
  "resourceType": "post",
  "resourceId": "uuid",
  "reason": "Acoso dirigido",
  "details": "Contexto opcional"
}
```

Tipos: `post | comment | chat | message | user`. Motivo: 3–160; detalle hasta
1.000 o `null`. Estados: `pending | reviewing | resolved | dismissed`. Solo se
puede reportar un recurso accesible y no puede coexistir otro reporte abierto
(`pending`/`reviewing`) del mismo usuario para el mismo recurso.

Un reporte devuelve sus datos y perfiles resumidos `reporter` y `assignedTo`
(este último puede ser `null`). Al actualizar, estados distintos de `pending`
asignan el reporte al moderador actual y notifican al reportante.

## Moderación de publicaciones

| Método  | Ruta                        | Entrada             | Respuesta                               |
| ------- | --------------------------- | ------------------- | --------------------------------------- |
| `GET`   | `/moderation/posts`         | —                   | `{posts}` de todos los estados, máx. 50 |
| `PATCH` | `/moderation/posts/:postId` | `{status, reason?}` | `{post}`                                |

Exige `moderator` o `admin`. `status` admite `approved | rejected`; un rechazo
requiere `reason` de 3–500 caracteres. Aprobar elimina cualquier motivo previo.

## Ejemplo mínimo con PowerShell

PowerShell 7 permite mantener la sesión con `-SessionVariable`:

```powershell
$body = @{
  email = 'ana@ejemplo.cl'
  password = 'una-clave-segura'
  username = 'ana'
  displayName = 'Ana Pérez'
} | ConvertTo-Json

$registration = Invoke-RestMethod `
  -Method Post `
  -Uri 'http://localhost:3000/api/v1/auth/register' `
  -ContentType 'application/json' `
  -Body $body `
  -SessionVariable koneaSession

Invoke-RestMethod `
  -Uri 'http://localhost:3000/api/v1/posts' `
  -WebSession $koneaSession
```

La aplicación web ya implementa estos clientes; este ejemplo sirve para pruebas
manuales y defensa técnica.
