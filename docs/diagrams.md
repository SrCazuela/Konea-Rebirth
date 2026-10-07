# Diagramas técnicos de Konea Rebirth

Estos diagramas resumen el incremento Capstone implementado. La definición
detallada de rutas y reglas se mantiene en [api.md](./api.md), y las decisiones
de diseño en [architecture.md](./architecture.md).

## Diagrama de componentes

```mermaid
flowchart LR
  student[Estudiante]
  staff[Moderación / administración]

  subgraph clients[Clientes]
    web[Web React + Vite]
    desktop[FocusBuddy Electron<br/>desktop.html local]
  end

  subgraph backend[Servicios de Konea]
    api[API REST Express]
    files[Archivos privados locales]
    db[(PostgreSQL)]
  end

  subgraph integrations[Integraciones configurables]
    openai[OpenAI]
    ollama[Ollama]
    ava[Calendario AVA ICS]
  end

  student --> web
  student --> desktop
  staff --> web
  web -->|JSON + cookie HttpOnly| api
  desktop -->|IPC allowlist + cookie HttpOnly| api
  api --> db
  api --> files
  api -->|DUCO, según configuración| openai
  api -->|DUCO local, según configuración| ollama
  api -->|importación explícita| ava
```

El cliente Electron no carga la SPA: incorpora una interfaz local con login,
estudio, progreso, ajustes y cuenta. Solo el proceso principal llama a una lista
cerrada de rutas de la API y conserva la cookie en su sesión persistente. Por
ello una sesión iniciada en escritorio aparece en el dashboard web y mantiene
una sola fuente de verdad en PostgreSQL.

## Modelo entidad-relación resumido

El esquema real contiene 31 tablas. Este diagrama muestra las relaciones que
explican los flujos centrales sin convertir la vista en una lista ilegible.

```mermaid
erDiagram
  USERS ||--|| PROFILES : posee
  USERS ||--o{ USER_SESSIONS : inicia
  USERS ||--o{ UPLOADED_FILES : sube

  USERS ||--o{ POSTS : publica
  USERS ||--o{ COMMENTS : escribe
  POSTS ||--o{ COMMENTS : recibe
  USERS ||--o{ POST_LIKES : marca
  POSTS ||--o{ POST_LIKES : recibe
  USERS ||--o{ CONNECTION_INTENTS : solicita
  USERS ||--o{ CONNECTIONS : integra

  CHATS ||--o{ CHAT_PARTICIPANTS : contiene
  USERS ||--o{ CHAT_PARTICIPANTS : participa
  CHATS ||--o{ MESSAGES : contiene
  USERS ||--o{ MESSAGES : envía
  MESSAGES ||--o{ MESSAGE_RECEIPTS : confirma
  USERS ||--o{ MESSAGE_RECEIPTS : recibe
  USERS ||--o{ CHAT_READS : registra
  MESSAGES ||--o| POLLS : adjunta
  POLLS ||--o{ POLL_OPTIONS : ofrece
  POLL_OPTIONS ||--o{ POLL_VOTES : recibe

  USERS ||--o{ ACADEMIC_COURSES : organiza
  USERS ||--o{ ACADEMIC_TASKS : crea
  ACADEMIC_COURSES ||--o{ ACADEMIC_TASKS : agrupa
  USERS ||--o{ ACADEMIC_CALENDAR_SYNCS : sincroniza
  USERS ||--o{ ACADEMIC_CALENDAR_EVENTS : importa

  USERS ||--o{ STUDY_SESSIONS : realiza
  ACADEMIC_COURSES o|--o{ STUDY_SESSIONS : contextualiza
  ACADEMIC_TASKS o|--o{ STUDY_SESSIONS : contextualiza
  STUDY_SESSIONS ||--o{ STUDY_SESSION_EVENTS : audita

  USERS ||--o{ ASSISTANT_MESSAGES : conversa
  USERS ||--o{ DUCO_DRAFTS : revisa
  ASSISTANT_MESSAGES o|--o| DUCO_DRAFTS : origina
  ASSISTANT_MESSAGES o|--o| SUPPORT_REQUESTS : origina
  SUPPORT_REQUESTS ||--o{ SUPPORT_REQUEST_EVENTS : mantiene

  USERS ||--o{ NOTIFICATIONS : recibe
  USERS ||--o{ REPORTS : reporta
```

`duco_drafts.completed_resource_id` enlaza conceptualmente el borrador con la
tarea o solicitud confirmada. No se dibuja como clave foránea porque el destino
depende de `kind` y, por tanto, puede pertenecer a dos tablas distintas.

## Secuencia de una sesión FocusBuddy

```mermaid
sequenceDiagram
  actor U as Estudiante
  participant F as FocusBuddy
  participant A as API Konea
  participant D as PostgreSQL

  U->>F: Inicia sesión en la interfaz local
  F->>A: POST /auth/login mediante IPC allowlist
  A->>D: Valida credenciales y crea sesión
  A-->>F: Cookie HttpOnly en la sesión Electron

  U->>F: Selecciona método, materia y tarea
  F->>A: POST /study/sessions + clientRequestId
  A->>D: Crea sesión y evento start
  D-->>A: Sesión activa única
  A-->>F: Estado activo

  loop cada 30 segundos mientras estudia
    F->>A: PATCH heartbeat
    A->>D: Actualiza último latido y tiempo efectivo
    A-->>F: Estado sincronizado
  end

  alt pausa y reanuda
    U->>F: Pausar
    F->>A: PATCH pause
    U->>F: Reanudar
    F->>A: PATCH resume
  else cierre o pérdida de conexión
    A->>D: Auto-pausa al detectar latido vencido
  end

  U->>F: Completar
  F->>A: PATCH complete
  A->>D: Cierra sesión y registra evento
  A-->>F: Dashboard actualizado
```

## Estados auditables

### Sesión de estudio

```mermaid
stateDiagram-v2
  [*] --> active: iniciar
  active --> paused: pausar / latido vencido
  paused --> active: reanudar
  active --> completed: completar
  paused --> completed: completar
  active --> cancelled: cancelar
  paused --> cancelled: cancelar
  completed --> [*]
  cancelled --> [*]
```

### Borrador preparado por DUCO

```mermaid
stateDiagram-v2
  [*] --> collecting_information: intención detectada
  collecting_information --> collecting_information: falta contexto
  collecting_information --> ready_for_review: datos mínimos completos
  ready_for_review --> confirmed: usuario revisa y confirma
  ready_for_review --> cancelled: usuario cancela
  collecting_information --> expired: vence
  ready_for_review --> expired: vence
  confirmed --> [*]
  cancelled --> [*]
  expired --> [*]
```

### Solicitud de soporte

```mermaid
stateDiagram-v2
  [*] --> pending: estudiante envía
  pending --> reviewing: personal toma el caso
  pending --> rejected: personal rechaza con nota
  pending --> resolved: personal resuelve con nota
  reviewing --> pending: devuelve a la cola
  reviewing --> resolved: personal resuelve con nota
  reviewing --> rejected: personal rechaza con nota
  resolved --> reviewing: reabre
  rejected --> reviewing: reabre
  resolved --> [*]
  rejected --> [*]
```

Cada cambio de soporte se agrega a `support_request_events`; el historial no se
reescribe al responder o cambiar de estado.
