# FocusBuddy: alcance e integración

FocusBuddy es el espacio de concentración de Konea. Existe como una pestaña de
la SPA y como un cliente Electron descargable; ambos usan la misma cuenta, API
y base PostgreSQL. El ejecutable no duplica las reglas de negocio ni incorpora
un servidor oculto.

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

## Flujo web y API

La implementación se divide en cuatro fronteras:

```text
FocusBuddy.tsx ─────────────┐
FocusAvatar.tsx (presentación) ─├─▶ src/api/study.ts ─▶ /api/v1/study
Agenda académica (materias/tareas) ─┘                         │
                                                               ▼
                                                PostgreSQL + eventos
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

## Avatar provisional y sprites definitivos

El avatar actual es una hoja PNG original de 4 × 4 creada para este prototipo,
no un personaje Shimeji descargado de terceros. Su procedencia y contrato se
documentan en `apps/web/src/assets/focusbuddy/README.md`; la interfaz web la
consume desde `FocusAvatar.tsx` y el compañero de escritorio incluye una copia
en su paquete. El temporizador no depende de la implementación visual. El
avatar recibe un único estado:

| Estado      | Cuándo se usa                        |
| ----------- | ------------------------------------ |
| `idle`      | no existe una sesión actual          |
| `focus`     | sesión activa                        |
| `paused`    | sesión pausada                       |
| `completed` | celebración tras completar un bloque |

Cada fila representa `idle`, `focus`, `paused` o `completed` y contiene cuatro
poses. Se anima por pasos, mantiene texto alternativo y respeta
`prefers-reduced-motion`. Cuando lleguen los sprites del dibujante, la
sustitución recomendada es:

1. exportar una hoja o secuencia por estado con dimensiones y punto de anclaje
   consistentes;
2. guardar los recursos optimizados bajo
   `apps/web/src/assets/focusbuddy/` sin datos personales;
3. reemplazar el recurso web y su copia de empaquetado, conservando la prop
   `mood`, los cuatro estados, el texto accesible y la clase exterior;
4. implementar un fallback estático y respetar `prefers-reduced-motion`;
5. probar escalado en escritorio, tablet y móvil antes de retirar la hoja
   provisional.

## Cliente Electron

El cliente en `apps/focusbuddy` carga `#focusbuddy` y conserva esa misma
`webContents` al alternar entre ventana normal y compacta. Por eso no existe un
segundo temporizador ni una implementación local de las reglas: React presenta
la sesión y la API/PostgreSQL siguen siendo la única autoridad.

Además incluye un compañero flotante opcional inspirado en el patrón de los
Shimeji, pero implementado desde cero con el avatar propio de Konea. Es una
ventana transparente que:

- refleja `idle`, sesión activa, pausa, bloque completado o falta de conexión;
- muestra título, asignatura y reloj a partir de un snapshot de presentación
  sanitizado; nunca recibe token, cookie ni credenciales;
- se puede arrastrar, redimensionar entre tres tamaños, mantener sobre otras
  ventanas, ocultar o usar para abrir/enfocar FocusBuddy;
- respeta la preferencia de movimiento reducido y es operable con teclado;
- no permite pausar, finalizar ni modificar una sesión: esas acciones continúan
  en la SPA para reutilizar validaciones y confirmaciones existentes.

La bandeja del sistema permite abrir la aplicación, alternar el modo compacto,
mostrar el compañero, configurar tamaño/movimiento, cerrar a la bandeja y, en
el instalador de Windows, iniciar con el sistema. Las notificaciones nativas al
cumplir un bloque son opt-in y solo enfocan la aplicación; no marcan la sesión
como completada por sí solas. Posición y preferencias se guardan como JSON
local acotado en el perfil Electron. No se sincronizan ni contienen datos de
autenticación.

La superficie privilegiada del preload expone únicamente operaciones acotadas
de ventana, preferencias, reintento y snapshots sanitizados. Todos los mensajes
IPC validan que el emisor sea una ventana creada por la aplicación. El renderer
no tiene Node.js, usa aislamiento de contexto y sandbox, bloquea webviews y
ventanas internas, mantiene seguridad web, rechaza navegación a otro origen y
solo deriva enlaces HTTPS (o HTTP local) al navegador del sistema. Los permisos
se limitan al origen Konea y a vídeo para el escáner QR; nunca se concede audio.

En el paquete de distribución también se desactivan DevTools, ejecución como
Node, `NODE_OPTIONS`, inspector y privilegios adicionales de `file://`; se
activan cifrado de cookies, integridad de ASAR y carga exclusiva desde ASAR. El
throttling en segundo plano se desactiva para que el heartbeat continúe al
minimizar la ventana.

### Configuración de URL

- Desarrollo: `http://localhost:5173/#focusbuddy` por defecto. Se permiten
  `FOCUSBUDDY_APP_URL` y `--app-url=...` para probar un endpoint HTTPS.
- `iniciar-focusbuddy.bat`: fuerza la URL local y guarda el perfil Electron en
  `.local/focusbuddy-desktop/`, junto al proyecto e ignorado por Git.
- Distribución: `FOCUSBUDDY_APP_URL` se valida durante el build y se incorpora
  como dato público. El ejecutable ignora overrides de URL en runtime para
  reducir phishing; cambiar de servidor exige volver a empaquetar.

La normalización elimina credenciales, query strings y hashes ajenos. Un
endpoint remoto debe usar HTTPS; HTTP se reserva a `localhost`, `127.0.0.1` o
`[::1]`.

### Comandos

```powershell
# API, web, migraciones y cliente local
.\iniciar-focusbuddy.bat

# Solo el shell, cuando API y web ya están activos
npm run focusbuddy

# Instalador demostrable contra la web local (todavía sin hosting)
Remove-Item Env:FOCUSBUDDY_APP_URL -ErrorAction SilentlyContinue
npm run dist:focusbuddy

# Instalador enlazado a una instalación publicada
$env:FOCUSBUDDY_APP_URL = 'https://konea.example'
npm run dist:focusbuddy
```

El comando de distribución genera la configuración, empaqueta y verifica el
endpoint y los fuses del ejecutable. El resultado se escribe en
`apps/focusbuddy/release/`, carpeta ignorada por Git. La URL es pública; nunca se
deben incorporar API keys, cookies, contraseñas ni enlaces ICS de AVA.

Mientras no exista hosting, omitir `FOCUSBUDDY_APP_URL` genera honestamente un
instalador local fijado a `http://localhost:5173/#focusbuddy`; la excepción HTTP
solo aplica al loopback del mismo equipo. Para demostrar ese instalador se debe
mantener `iniciar.bat` abierto (levanta PostgreSQL, migraciones, API y web) y
abrir después la aplicación instalada. `iniciar-focusbuddy.bat` sigue siendo el
recorrido más directo para desarrollo: levanta esos servicios y abre el shell
Electron no empaquetado. Un instalador destinado a otros equipos no será
autónomo hasta publicar web/API; ese build remoto exige una URL HTTPS.

### Publicación y descarga

El workflow `.github/workflows/focusbuddy-release.yml` publica una versión de
Windows x64 cuando se envía un tag `focusbuddy-v*`; el tag debe coincidir
exactamente con `focusbuddy-v<version>` de `apps/focusbuddy/package.json`. La
variable de repositorio `FOCUSBUDDY_APP_URL` debe apuntar a la instalación HTTPS
de Konea; el workflow rechaza valores vacíos, HTTP o con credenciales. El release
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

El MVP no funciona sin una web/API accesible, no inicia ciclos automáticos de
descanso, no divide tiempo entre días y no incluye actualizaciones automáticas.
La notificación local opcional depende de que la SPA emita el snapshot mientras
está abierta y no sustituye un servicio push. El instalador local tampoco está
firmado.

La siguiente fase recomendada es:

1. reemplazar la hoja provisional por los sprites definitivos y validar sus
   anclas tanto en la web como en el compañero flotante;
2. agregar ciclos de descanso configurables y, después del consentimiento,
   notificaciones push que funcionen con la ventana cerrada;
3. validar con estudiantes qué dashboards aportan valor (por método, tarea,
   franja horaria u objetivo semanal) antes de acumular gráficos;
4. materializar sesiones abandonadas con un trabajo programado del servidor;
5. publicar web/API con HTTPS, regenerar el cliente contra ese endpoint, firmar
   el instalador y definir actualizaciones verificadas;
6. ejecutar pruebas E2E del recorrido login → sesión → pausa → cierre
   abrupto → recuperación → finalización.
