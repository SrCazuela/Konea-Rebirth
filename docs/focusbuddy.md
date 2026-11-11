# FocusBuddy: alcance e integración

FocusBuddy es el espacio de concentración de Konea. Existe como una pestaña web
y como una aplicación Electron descargable con interfaz local propia. No abre
ni incrusta la SPA: carga `electron/desktop.html` desde el paquete. Ambos
clientes comparten cuenta y datos cuando pertenecen al mismo entorno. PostgreSQL
continúa siendo la fuente de verdad detrás de su API. El ejecutable no incorpora
un servidor ni accede directamente a la base de datos.

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

Mientras están autenticados y visibles, ambos clientes consultan el resumen,
las materias y los pendientes cada 10 segundos, además de refrescar al volver
a la vista. El escritorio conserva consultas cada 30 segundos cuando está
oculto y el compañero sigue habilitado, para actualizar su estado. Una acción
en un cliente se refleja en el otro mediante la API; no
se envían credenciales entre aplicaciones. Ante un conflicto `409`, se recupera
el estado actual en lugar de mantener un cronómetro antiguo o indicar una
desconexión falsa. Las consultas no se superponen ni reemplazan una mutación
local con una respuesta anterior.

Esta conexión requiere la **misma cuenta y el mismo backend**. La web local
con API local y un instalador dirigido a otra API no comparten datos. Las
preferencias del dispositivo tampoco se copian a otro equipo.

Hay dos canales separados: **local** para trabajar con Konea en este equipo y
**oficial** para usar las cuentas y datos de la plataforma publicada. Sus
identidades de aplicación, perfiles y protocolos son distintos; pueden
instalarse sin que uno cambie el servidor o la sesión del otro. Publicar cambios
de código no copia datos entre sus bases.

Los contratos HTTP completos se encuentran en [api.md](./api.md) y el esquema
se define en `apps/api/src/db/schema.ts`, con la migración correspondiente en
`apps/api/drizzle/`.

## Sprites web y escritorio

La web y el escritorio muestran el **chibi oficial** de forma predeterminada.
El escritorio conserva **Kuco** como alternativa en Ajustes y en la bandeja.
Su hoja transparente 4 × 4 representa reposo, concentración, pausa y celebración;
en la tarjeta de estudio Kuco conserva la pose frontal estática y el parpadeo.

Electron usa 35 PNG transparentes de alta resolución entregados por la artista
en noviembre de 2026. Están en
`apps/focusbuddy/electron/assets/avatar-hq/` y son copias byte por byte de los
archivos normales de `D:\konea-rebirth\Avatar de Konea (pintado)`, con nombres
ASCII para el runtime. Cada PNG mantiene su lienzo de 2136 × 3000; el
`source-manifest.json` conserva nombre original, SHA-256, dimensiones y grupos
de animación. No se redibujaron, redujeron ni regeneraron las ilustraciones.
Las carpetas anteriores `avatar-official/` y `avatar-cutout/` se preservan como
antecedentes, pero no son la fuente del chibi actual.

La tarjeta de estudio, la vista de cuenta, la vista previa y el compañero
flotante presentan las imágenes con un viewport CSS común de 1778 × 2065,
correspondiente al rectángulo `[176, 915, 1954, 2980]` del lienzo. Comparten
escala y punto de apoyo sin cambiar los píxeles guardados en los archivos.
La precarga se limita a la escena que necesita cada vista; no se decodifican
los 35 archivos al iniciar Electron.

`electron/avatar-library.js` define 13 escenas:

| Escena                       | Recursos usados                           |
| ---------------------------- | ----------------------------------------- |
| Espera                       | ojos abiertos, medios y cerrados          |
| Teclado                      | tres posiciones y cierre de ojos dedicado |
| Teclado concentrado          | tres posiciones de concentración          |
| Cuaderno                     | dos posiciones de escritura               |
| Cuaderno concentrado         | dos posiciones de escritura concentrada   |
| Lectura                      | dos posiciones con el libro               |
| Teclado cansado              | tres posiciones, cierre de ojos y bostezo |
| Lectura cansada              | lectura cansada, cierre de ojos y bostezo |
| Descanso                     | cuatro poses con la taza                  |
| Celebración                  | tres poses de celebración                 |
| Aplauso                      | dos poses de aplauso                      |
| Descanso largo en el teclado | pose dormida con el portátil              |
| Descanso largo con el libro  | pose dormida con el libro                 |

El selector **Ajustes → Animaciones del chibi** permite ver las 13 escenas sin
cambiar la preferencia de personaje, incluso cuando se elige Kuco como
alternativa en **Personaje**. Las escenas de sesión dependen del estado, método y tiempo
enfocado; la vista previa permite también revisar los descansos largos sin
convertirlos en una transición automática del temporizador.

`electron/avatar-animation.js` es el motor compartido de la ventana principal
y la ventana flotante. Separa el movimiento de la pose de los parpadeos:
espera de 3,2 a 6,4 segundos, cierre breve, reapertura y un segundo parpadeo
ocasional. El chibi en espera recorre ojos medios, cerrados y medios antes
de volver a los abiertos. Kuco mira al frente y parpadea en la tarjeta de
estudio. Los refrescos del reloj no reinician una animación cuyo estado no
cambió. Ocultar una vista cancela sus tiempos; destruirla los libera.

El chibi flota con el mismo ciclo suave en la tarjeta, la cuenta, la vista previa
y la ventana flotante: 3,2 segundos, con un desplazamiento vertical de 0 a 3
píxeles y vuelta al origen. Cambiar el estado de sesión o refrescar su reloj
no reemplaza ese ciclo. Movimiento reducido también detiene la flotación.

No todas las poses tienen un cierre propio: escritura en cuaderno, lectura
normal y concentración conservan sus fotogramas disponibles sin cambiar a
reposo o a otra pose para simular ojos cerrados. Las ilustraciones de
celebración, aplauso y sueño ya tienen los ojos cerrados. El temporizador y
las reglas de sesión no dependen de estos recursos. Kuco conserva este contrato:

| Estado      | Cuándo se usa                        |
| ----------- | ------------------------------------ |
| `idle`      | no existe una sesión actual          |
| `focus`     | sesión activa                        |
| `paused`    | sesión pausada                       |
| `completed` | celebración tras completar un bloque |

Ambos clientes respetan movimiento reducido. El escritorio guarda la elección
`Kuco`/`Chibi oficial` como preferencia local. Los archivos antiguos guardaban
Kuco sin distinguir el valor predeterminado de una selección manual: se migran
una vez al chibi oficial y se marcan con `companionCharacterVersion: 1`.
Las selecciones posteriores de ambos personajes se conservan, junto con los
demás ajustes existentes. El motor de escritorio fija el primer fotograma cuando la
preferencia local o el sistema solicita movimiento reducido. La interfaz evita
aros o marcos alrededor del personaje.

### Siguiente fase: ojos que siguen el mouse

Todavía no hay seguimiento del puntero. Los PNG de
`D:\konea-rebirth\Avatar de Konea (recortado)` contienen el cuerpo con el ojo
vacío y los dos iris separados dentro del mismo lienzo; no son todavía archivos
independientes por capa. El plan de integración es:

1. Extraer cuerpo e iris sin redibujarlos y registrar sus coordenadas originales.
   Mantener los PNG fuente y un manifiesto de procedencia como en los sprites normales.
2. Definir anclajes y máscaras por pose para ubicar y recortar cada iris dentro
   de la abertura del ojo; comprobar la alineación al cambiar de escena.
3. Convertir la posición del mouse a coordenadas locales del rostro, limitar el
   desplazamiento dentro de cada máscara y suavizar la transición de la mirada.
   El compañero de escritorio necesitará recibir únicamente la posición necesaria
   mediante una operación acotada del proceso principal, sin exponer una API genérica.
4. Dar prioridad al cierre de párpados sobre el movimiento del iris. Al ocultar
   la ventana o activar movimiento reducido, detener el seguimiento y recuperar
   la mirada neutra. Probar zoom de pantalla y varios monitores antes de habilitarlo.

## Cliente Electron

El cliente en `apps/focusbuddy` carga `electron/desktop.html` mediante
`loadFile`. Su interfaz morada contiene las pestañas Estudio, Progreso, Ajustes
y Cuenta, incluido un login propio. Permite elegir método, materia y pendiente,
controlar la sesión, revisar métricas y administrar preferencias de escritorio.
Cuenta permite cambiar nombre visible, usuario, correo y contraseña mediante
`/auth/account` y `/auth/password`: exige la contraseña actual, limpia los
campos sensibles tras guardar y revoca las otras sesiones. El cliente que
confirma mantiene su sesión renovada. La página web recupera los datos actuales
mediante `/auth/me` y solicita identificarse de nuevo si su sesión fue revocada.
La tarea seleccionada puede marcarse como completada mediante una acción
explícita y confirmada, que usa `PATCH /academic/tasks/:taskId`. Finalizar el
bloque de estudio no cambia automáticamente el estado del pendiente.
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
login/me/logout, actualización de cuenta y contraseña, dashboard académico,
estado de pendientes, resumen de estudio, inicio y transición de sesiones. No existe un `fetch` genérico. El proceso principal valida cada
operación y payload, rechaza redirecciones y realiza la solicitud con
`credentials: include` desde una sesión persistente de Electron. La cookie
`HttpOnly` no se expone a `desktop.html`. Las peticiones del bridge tienen
un límite de 20 segundos, que también cubre una respuesta cuyo cuerpo no
termina de llegar. No se repiten automáticamente las escrituras que podrían
haberse aplicado en el servidor.

Todos los mensajes IPC validan que el emisor sea una ventana creada por la
aplicación. El renderer no tiene Node.js, usa aislamiento de contexto y sandbox,
bloquea webviews, ventanas nuevas, navegación y permisos. Su CSP también
rechaza conexiones directas: toda sincronización pasa por la allowlist del
proceso principal.

El preload transmite resultados y errores como objetos serializables. El
renderer reconstruye sus errores en su propio contexto, conservando estado,
código y campos de validación; así distingue sesión expirada (401), conflictos
de sincronización (409) y problemas de conexión también en Electron real.

En el paquete de distribución también se desactivan DevTools, ejecución como
Node, `NODE_OPTIONS`, inspector y privilegios adicionales de `file://`; se
activan cifrado de cookies, integridad de ASAR y carga exclusiva desde ASAR. El
throttling en segundo plano se desactiva para que el heartbeat continúe al
minimizar la ventana.

Desde 0.1.2, la interfaz se sirve mediante el origen interno
`konea-focusbuddy-ui://app`, registrado en la sesión de cada canal. Solo admite
GET/HEAD a sus páginas, scripts, estilos y sprites permitidos. No sirve rutas
arbitrarias, archivos de configuración ni scripts del proceso principal. Esto
permite cargar el paquete sin habilitar privilegios adicionales de `file://`.

### Canales y configuración de API

| Canal   | API                                                       | Protocolo                       | Salida del instalador                 |
| ------- | --------------------------------------------------------- | ------------------------------- | ------------------------------------- |
| Local   | `http://localhost:3000/api/v1` por defecto; solo loopback | `konea-focusbuddy-local://open` | `apps/focusbuddy/release/local/`      |
| Oficial | API remota HTTPS incorporada durante el build             | `konea-focusbuddy://open`       | `apps/focusbuddy/release/production/` |

`iniciar-focusbuddy.bat` prepara el entorno local y abre su cliente sin Vite ni
la web. Las opciones de desarrollo no permiten convertir ese canal en un
cliente de la plataforma remota.

Para el canal oficial se exige `FOCUSBUDDY_API_URL` durante el empaquetado. La
URL es un dato público, debe usar HTTPS, terminar en `/api/v1` y no contener
credenciales, query string ni fragmento. Se rechaza una API loopback y la
ausencia de configuración detiene el build: nunca recurre a localhost. El
ejecutable empaquetado ignora overrides de runtime; cambiar de servidor exige
volver a empaquetar. No se incluyen claves ni secretos del proxy en el cliente.

### Comandos

```powershell
# PostgreSQL, migraciones, API y cliente local (sin Vite)
.\iniciar-focusbuddy.bat

# Solo Electron, cuando la API ya está activa
npm run focusbuddy

# Instalador para trabajar contra la API local
Remove-Item Env:FOCUSBUDDY_API_URL -ErrorAction SilentlyContinue
npm run dist:local --workspace @konea/focusbuddy

# Instalador oficial; usar la API HTTPS publicada y comprobada
$env:FOCUSBUDDY_API_URL = 'https://konea-campus-connect.danaealvarez0917.chatgpt.site/api/v1'
npm run dist:production --workspace @konea/focusbuddy
```

El comando de distribución genera la configuración, empaqueta y verifica el
endpoint, el canal y los fuses del ejecutable. Cada canal escribe en su propia
subcarpeta de `apps/focusbuddy/release/`, ignorada por Git. La URL es pública;
nunca se deben incorporar API keys, cookies, contraseñas ni enlaces ICS de AVA.

Para demostrar el canal local se deben mantener PostgreSQL y la API activos.
`iniciar-focusbuddy.bat` prepara esos servicios y abre Electron sin Vite. El
canal oficial necesita una API publicada accesible desde el equipo del
estudiante y un inicio de sesión propio; tener una sesión abierta en el
navegador no inicia sesión en Electron.

### Publicación y descarga

La tarjeta web distingue el entorno por el hostname del navegador. En
`localhost`, `127.0.0.1` y `[::1]`, incluso con una compilación de producción
previsualizada localmente, **Abrir FocusBuddy local** usa
`konea-focusbuddy-local://open`. En un sitio alojado, **Abrir FocusBuddy** usa
`konea-focusbuddy://open` y la descarga corresponde exclusivamente al canal
oficial. La web local no ofrece ese instalador para evitar mezclar cuentas y
servidores.

La versión instalada registra su protocolo y abre o enfoca su ventana propia.
El navegador o Windows pueden pedir confirmación; el enlace no permite
comprobar que el programa se abrió. Requiere instalar la versión actual: un
ejecutable anterior no adquiere el protocolo por actualizar la página. El
enlace no transmite contraseñas, cookies, endpoints ni otra configuración, y
no inicia sesión automáticamente.

El workflow `.github/workflows/focusbuddy-release.yml` publica una versión de
Windows x64 cuando se envía un tag `focusbuddy-v*`; el tag debe coincidir
exactamente con `focusbuddy-v<version>` de `apps/focusbuddy/package.json`. La
variable de repositorio `FOCUSBUDDY_API_URL` debe apuntar a la API HTTPS y
terminar en `/api/v1`; el workflow rechaza valores vacíos, HTTP remoto,
credenciales, query o fragmento. El release
incluye:

- `Konea-FocusBuddy-Windows-x64.exe`;
- `SHA256SUMS.txt`, que permite verificar el instalador publicado.

La tarjeta del portal alojado solo presenta la descarga cuando
`VITE_FOCUSBUDDY_DOWNLOAD_URL` apunta al artefacto oficial
`Konea-FocusBuddy-Windows-x64.exe` en un release HTTPS del repositorio
`SrCazuela/Konea-Rebirth` en GitHub. Admite una versión concreta o el alias
`latest/download`. Después de publicar y comprobar el artefacto puede
configurarse, por ejemplo, con:

```dotenv
VITE_FOCUSBUDDY_DOWNLOAD_URL=https://github.com/SrCazuela/Konea-Rebirth/releases/latest/download/Konea-FocusBuddy-Windows-x64.exe
```

La tarjeta se oculta dentro del propio cliente Electron porque allí la
aplicación ya está instalada.

Si la variable está vacía o no cumple esa validación, la interfaz indica
**Versión oficial aún no publicada**, sin crear un enlace de ejemplo. Se
rechazan otros repositorios o hosts, puertos no estándar, artefactos locales,
credenciales, query string y fragmento. La URL es configuración pública, no una
clave, y queda incorporada al compilar la web. Cambiarla requiere reconstruir
y publicar el frontend. El instalador permanece sin firma digital hasta que
el equipo configure un certificado de firma de código.

## Estado de validación y publicación

La separación de canales y el protocolo interno de 0.1.2 tienen 107 pruebas de
escritorio aprobadas, incluidas regresiones para captura del icono, aislamiento
de cuentas, configuración verificada y acceso restringido a recursos. La web
tiene 52 pruebas aprobadas. La portada pública y el portal pueden presentar la
descarga oficial verificada; el entorno local solo abre su propio cliente.
El destino oficial actual es
`https://konea-campus-connect.danaealvarez0917.chatgpt.site/api/v1`.

El [release oficial 0.1.2](https://github.com/SrCazuela/Konea-Rebirth/releases/tag/focusbuddy-v0.1.2)
incluye el instalador de Windows x64 y sus checksums. La descarga completa
coincidió con el SHA-256 publicado. Los ejecutables reales de ambos canales
cargaron sus 35 sprites; el oficial aprobó login, reinicio conservando sesión,
logout y sincronización de sesiones y tareas con la API alojada. Las pruebas
de escritura usaron una cuenta temporal que después se eliminó.

Antes de separar los canales, en la revisión local del 11 de noviembre de 2026
se generó y verificó
`apps/focusbuddy/release/Konea-FocusBuddy-0.1.1-x64.exe`, con Electron 44.11.1 y
la API incorporada `http://localhost:3000/api/v1`. Este artefacto sirve para el
entorno local y no se debe publicar como cliente oficial. Las nuevas
compilaciones usan las subcarpetas y protocolos de la tabla anterior. Ni el
build ni la configuración de un enlace confirman por sí solos su publicación,
instalación o conectividad remota.

El registro reúne **420 pruebas automatizadas aprobadas**: 197 de API,
18 del conector AVA, 107 de escritorio, 52 del cliente web, 32 de sincronización
y 14 de alojamiento. `npm audit --omit=dev` no informó avisos; permanecen
10 avisos moderados de desarrollo. Al cierre, Docker local quedó bloqueado
tras agotarse C:; no se repitieron las pruebas dependientes de esa base
después del fallo. Esto no afecta la validación remota de 0.1.2.

También se aprobó un recorrido E2E local de **13 etapas** con Edge y Electron
44.11.1 reales, sin mocks ni errores de página. Verificó acceso en ambas
interfaces; inicio y pausa desde la web reflejados en el escritorio;
reanudación, finalización y completado explícito de una tarea desde el
escritorio reflejados en la web; cambios de cuenta y contraseña con revocación
de sesión y nuevo acceso; y el diseño móvil de 390 píxeles y el compañero.
El PNG del avatar móvil se decodificó a 2136 × 3000. La evidencia quedó en
`.local/fixes-20261110/e2e-real/report.json`, con limpieza de la base aislada y
los procesos verificada. Este recorrido no cubre cierre abrupto y recuperación,
caída de la API, instalación limpia ni ejecución contra la demo remota.

El cliente oficial 0.1.2 usa la URL pública de Sites seguida de `/api/v1`:
el proxy añade su secreto únicamente en el servidor. El acceso, el login y la
sincronización de sesiones y tareas se comprobaron contra la API publicada.
Cada nueva versión debe repetir esas verificaciones, sin incorporar el secreto
del proxy al programa. Véase [hosting-sites.md](./hosting-sites.md).

## Limitaciones y siguiente fase

El cliente de escritorio no funciona plenamente sin una API accesible, no
incluye cola offline, no inicia ciclos automáticos de descanso, no divide tiempo
entre días y no incluye actualizaciones automáticas. La notificación local
opcional depende de que la ventana principal mantenga el snapshot de sesión y
no sustituye un servicio push. Los instaladores local y oficial no están firmados.

La siguiente fase recomendada es:

1. preparar las capas y anclajes para seguimiento del mouse según el plan
   anterior y solicitar cierres de ojos de las poses que aún no los tienen;
2. agregar ciclos de descanso configurables y, después del consentimiento,
   notificaciones push que funcionen con la ventana cerrada;
3. validar con estudiantes qué dashboards aportan valor (por método, tarea,
   franja horaria u objetivo semanal) antes de acumular gráficos;
4. materializar sesiones abandonadas con un trabajo programado del servidor;
5. firmar el instalador y definir actualizaciones verificadas;
6. ampliar el E2E local con cierre abrupto y recuperación, caída de la API e
   instalación limpia, y automatizar la repetición del recorrido remoto ya aprobado.
