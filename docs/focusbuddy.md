# FocusBuddy: alcance e integración

FocusBuddy es el espacio de concentración de Konea. Existe como una pestaña web
y como una aplicación Electron descargable con interfaz local propia. No abre
ni incrusta la SPA: carga `electron/desktop.html` desde el paquete. Ambos
clientes usan la misma cuenta y API, y PostgreSQL continúa siendo la fuente de
verdad detrás de esa API. El ejecutable no incorpora un servidor ni accede
directamente a la base de datos.

## Alcance actual

La pantalla permite elegir una materia o un pendiente propio y comenzar uno de
estos métodos:

| Método             | Concentración | Pausa sugerida | Comportamiento actual  |
| ------------------ | ------------- | -------------- | ---------------------- |
| Pomodoro           | 25 min        | 5 min          | bloque finito          |
| Pomodoro extendido | 50 min        | 10 min         | bloque finito          |
| Trabajo profundo   | 90 min        | 20 min         | bloque finito          |
| Flowtime           | libre         | sin pausa      | cronómetro ascendente  |
| Personalizado      | 1–240 min     | 0–120 min      | valores del estudiante |

Una sesión se puede pausar, reanudar, completar o cancelar. Completarla suma
su tiempo a las métricas; cancelarla la conserva en el historial pero no la
incluye en los agregados. Al alcanzar la duración de un bloque finito el reloj
llega a cero y pide finalizarlo: no envía nada ni inicia un descanso sin una
acción del estudiante.

El panel implementado presenta:

- tiempo completado hoy, durante la semana y en total;
- sesiones no canceladas y cantidad completada;
- racha actual y mejor racha;
- barras de los últimos siete días;
- distribución por materia;
- las ocho sesiones más recientes.

Las agregaciones usan sesiones completadas y asignan todo el bloque al día en
que comenzó. Es una decisión de MVP; dividir una sesión que cruce medianoche
requiere un modelo de segmentos posterior.

## Flujo de clientes y API

La implementación conserva una sola autoridad de negocio con dos interfaces:

```text
Web: FocusBuddy.tsx ───────────────┐
Web: src/api/study.ts ─────────────┤
                                    ├─▶ API /api/v1 ─▶ PostgreSQL + eventos
Electron: desktop.html + preload ──┤
Electron: operaciones allowlist ───┘
```

`POST /study/sessions` recibe un `clientRequestId` UUID para hacer idempotente
un reintento, valida propiedad de materia/tarea y crea el evento `start` en la
misma transacción. Una restricción parcial de PostgreSQL permite solo una sesión
`active` o `paused` por cuenta.

`PATCH /study/sessions/:id` acepta `heartbeat`, `pause`, `resume`, `complete` y
`cancel`. El tiempo mostrado en React se anima cada segundo, pero el tiempo
autoritativo lo calcula la API. Mientras la sesión está activa, el cliente envía
un heartbeat cada 30 segundos. La API concede como máximo 90 segundos desde el
último latido y materializa una pausa segura en la siguiente consulta o
transición. Cerrar la ventana o perder conexión no puede inflar el tiempo de
forma indefinida.

Los contratos HTTP completos se encuentran en [api.md](./api.md) y el esquema
se define en `apps/api/src/db/schema.ts`, con la migración correspondiente en
`apps/api/drizzle/`.

## Sprites web y escritorio

La web y el escritorio usan por defecto la hoja transparente 4 × 4 de **Kuco**,
documentada en `apps/web/src/assets/focusbuddy/README.md` y consumida por
`FocusAvatar.tsx`. Sus filas representan reposo, concentración, pausa y
celebración, con cuatro fotogramas por estado. Electron conserva doce PNG fuente
entregados por el equipo en
`apps/focusbuddy/electron/assets/avatar-official/`: tres poses de reposo, tres
de escritura, tres de escritura concentrada, un parpadeo y dos poses de
estudio. Esa carpeta incluye un manifiesto con nombre original e identificador
de Drive.

Los PNG fuente miden 2136 × 2136 y conservan el fondo opaco `#B7B7B7`. El
runtime de Electron consume copias derivadas con transparencia desde
`apps/focusbuddy/electron/assets/avatar-cutout/`; la extracción del fondo no
sobrescribe los originales ni su trazabilidad. El chibi sigue siendo una
alternativa seleccionable y todavía reutiliza poses porque no tiene fotogramas
dedicados para pausa y celebración. El temporizador y las reglas de sesión no
dependen de estos recursos. Kuco conserva este contrato:

| Estado      | Cuándo se usa                        |
| ----------- | ------------------------------------ |
| `idle`      | no existe una sesión actual          |
| `focus`     | sesión activa                        |
| `paused`    | sesión pausada                       |
| `completed` | celebración tras completar un bloque |

Ambos clientes respetan movimiento reducido. El escritorio guarda la elección
`Kuco`/`Chibi oficial` como preferencia local y migra las configuraciones
anteriores a Kuco. La interfaz evita aros o marcos alrededor del personaje.

## Cliente Electron

El cliente en `apps/focusbuddy` carga `electron/desktop.html` mediante
`loadFile`. Su interfaz morada contiene las pestañas Estudio, Progreso, Ajustes
y Cuenta, incluido un login propio. Permite elegir método, materia y pendiente,
controlar la sesión, revisar métricas y administrar preferencias de escritorio.
El reloj se presenta localmente, pero la API/PostgreSQL siguen siendo la única
autoridad del tiempo y las transiciones.

Además incluye un compañero flotante opcional inspirado en el patrón de los
Shimeji, pero implementado desde cero con el avatar propio de Konea. Es una
ventana transparente que:

- refleja `idle`, sesión activa, pausa, bloque completado o falta de conexión;
- muestra título, asignatura y reloj a partir de un snapshot de presentación
  sanitizado; nunca recibe token, cookie ni credenciales;
- se puede arrastrar, redimensionar entre tres tamaños, mantener sobre otras
  ventanas, ocultar o usar para abrir/enfocar FocusBuddy;
- respeta la preferencia de movimiento reducido y es operable con teclado;
- no recibe credenciales ni llama a la API: los controles de sesión permanecen
  en la ventana principal local.

La bandeja del sistema permite abrir la aplicación, alternar el modo compacto,
mostrar el compañero, configurar tamaño/movimiento, cerrar a la bandeja y, en
el instalador de Windows, iniciar con el sistema. Las notificaciones nativas al
cumplir un bloque son opt-in y solo enfocan la aplicación; no marcan la sesión
como completada por sí solas. Posición y preferencias se guardan como JSON
local acotado en el perfil Electron. No se sincronizan ni contienen datos de
autenticación.

La pestaña Ajustes permite mostrar u ocultar el compañero, elegir entre Kuco y
el chibi oficial, mantenerlo siempre visible, elegir su escala, activar el modo compacto, cerrar a la bandeja,
iniciar con Windows, habilitar notificaciones y reducir movimiento. Son
preferencias del dispositivo; la cuenta, las materias, los pendientes y las
sesiones sí se sincronizan mediante la API.

La superficie privilegiada del preload expone únicamente preferencias,
snapshots sanitizados y una lista cerrada de operaciones de API: salud,
login/me/logout, dashboard académico, resumen de estudio, inicio y transición
de sesiones. No existe un `fetch` genérico. El proceso principal valida cada
operación y payload, rechaza redirecciones y realiza la solicitud con
`credentials: include` desde una sesión persistente de Electron. La cookie
`HttpOnly` no se expone a `desktop.html`.

Todos los mensajes IPC validan que el emisor sea una ventana creada por la
aplicación. El renderer no tiene Node.js, usa aislamiento de contexto y sandbox,
bloquea webviews, ventanas nuevas, navegación y permisos. Su CSP también
rechaza conexiones directas: toda sincronización pasa por la allowlist del
proceso principal.

En el paquete de distribución también se desactivan DevTools, ejecución como
Node, `NODE_OPTIONS`, inspector y privilegios adicionales de `file://`; se
activan cifrado de cookies, integridad de ASAR y carga exclusiva desde ASAR. El
throttling en segundo plano se desactiva para que el heartbeat continúe al
minimizar la ventana.

### Configuración de API

- Desarrollo: `http://localhost:3000/api/v1` por defecto. Se permiten
  `FOCUSBUDDY_API_URL` y `--api-url=...`.
- `iniciar-focusbuddy.bat`: pasa la API local al cliente, guarda el perfil en
  `.local/focusbuddy-desktop/` y no inicia Vite ni la web.
- Distribución: `FOCUSBUDDY_API_URL` se valida durante el build y se incorpora
  como dato público. El ejecutable empaquetado ignora overrides de runtime;
  cambiar de servidor exige volver a empaquetar.

La URL base no admite credenciales, query string ni fragmento y debe terminar
en `/api/v1` para la publicación. Un endpoint remoto requiere HTTPS; HTTP se
reserva a `localhost`, `127.0.0.1` o `[::1]`.

### Comandos

```powershell
# PostgreSQL, migraciones, API y cliente local (sin Vite)
.\iniciar-focusbuddy.bat

# Solo Electron, cuando la API ya está activa
npm run focusbuddy

# Instalador demostrable contra la API local (todavía sin hosting)
Remove-Item Env:FOCUSBUDDY_API_URL -ErrorAction SilentlyContinue
npm run dist:focusbuddy

# Instalador enlazado a una API publicada
$env:FOCUSBUDDY_API_URL = 'https://api.konea.example/api/v1'
npm run dist:focusbuddy
```

El comando de distribución genera la configuración, empaqueta y verifica el
endpoint y los fuses del ejecutable. El resultado se escribe en
`apps/focusbuddy/release/`, carpeta ignorada por Git. La URL es pública; nunca se
deben incorporar API keys, cookies, contraseñas ni enlaces ICS de AVA.

Mientras no exista hosting, omitir `FOCUSBUDDY_API_URL` genera un instalador
local fijado a `http://localhost:3000/api/v1`; la excepción HTTP solo aplica al
loopback del mismo equipo. Para demostrarlo se deben mantener PostgreSQL y la
API activos. `iniciar-focusbuddy.bat` es el recorrido más directo: prepara esos
servicios y abre Electron sin Vite. Un instalador para otros equipos requiere
una API publicada mediante HTTPS; publicar la web no es un requisito técnico
del cliente de escritorio.

### Publicación y descarga

El workflow `.github/workflows/focusbuddy-release.yml` publica una versión de
Windows x64 cuando se envía un tag `focusbuddy-v*`; el tag debe coincidir
exactamente con `focusbuddy-v<version>` de `apps/focusbuddy/package.json`. La
variable de repositorio `FOCUSBUDDY_API_URL` debe apuntar a la API HTTPS y
terminar en `/api/v1`; el workflow rechaza valores vacíos, HTTP remoto,
credenciales, query o fragmento. El release
incluye:

- `Konea-FocusBuddy-Windows-x64.exe`;
- `Konea-FocusBuddy-Windows-x64.exe.sha256`.

La tarjeta de descarga del portal solo presenta el enlace cuando
`VITE_FOCUSBUDDY_DOWNLOAD_URL` contiene una URL HTTPS válida. Para enlazar
siempre la publicación más reciente puede configurarse, por ejemplo, con:

```dotenv
VITE_FOCUSBUDDY_DOWNLOAD_URL=https://github.com/SrCazuela/Konea-Rebirth/releases/latest/download/Konea-FocusBuddy-Windows-x64.exe
```

La tarjeta se oculta dentro del propio cliente Electron porque allí la
aplicación ya está instalada.

Si la variable está vacía, no usa HTTPS o contiene credenciales, query string o
fragmento, la interfaz indica honestamente que la versión pública todavía no fue
publicada. La URL es configuración pública, no una clave, y queda incorporada al
compilar la web. El instalador permanece sin firma digital hasta que el equipo
configure un certificado de firma de código.

## Limitaciones y siguiente fase

El cliente de escritorio no funciona plenamente sin una API accesible, no
incluye cola offline, no inicia ciclos automáticos de descanso, no divide tiempo
entre días y no incluye actualizaciones automáticas. La notificación local
opcional depende de que la ventana principal mantenga el snapshot de sesión y
no sustituye un servicio push. El instalador local tampoco está firmado.

La siguiente fase recomendada es:

1. reemplazar los derivados por exportaciones transparentes entregadas por el
   equipo y agregar estados de pausa/celebración para que el chibi alcance la
   misma cobertura visual de Kuco;
2. agregar ciclos de descanso configurables y, después del consentimiento,
   notificaciones push que funcionen con la ventana cerrada;
3. validar con estudiantes qué dashboards aportan valor (por método, tarea,
   franja horaria u objetivo semanal) antes de acumular gráficos;
4. materializar sesiones abandonadas con un trabajo programado del servidor;
5. publicar la API con HTTPS, regenerar el cliente contra ese endpoint, firmar
   el instalador y definir actualizaciones verificadas;
6. ejecutar pruebas E2E del recorrido login → sesión → pausa → cierre
   abrupto → recuperación → finalización.
