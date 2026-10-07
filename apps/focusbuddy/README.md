# Konea FocusBuddy para escritorio

Este cliente empaqueta una interfaz local propia: no carga la SPA ni una página
remota dentro de Electron. La ventana ofrece acceso a la cuenta Konea, sesiones
de estudio, progreso y configuración de escritorio aunque el frontend web no
esté iniciado. La API de Konea sigue siendo la autoridad de autenticación,
tiempo y estadísticas, por lo que las operaciones con datos requieren conexión.

La aplicación incorpora:

- login y restauración de la sesión Konea en el perfil aislado de Electron;
- ventana principal local y modo compacto sobre la misma sesión;
- panel de progreso y creación, pausa, reanudación y término de sesiones;
- configuración accesible tanto desde la ventana como desde la bandeja;
- compañero flotante con Kuco animado por defecto y el chibi oficial como alternativa;
- bandeja del sistema y cierre opcional a la bandeja;
- preferencias locales de personaje, tamaño, posición, animación y siempre visible;
- inicio opcional con Windows en la versión instalada;
- aviso nativo opt-in al llegar a cero, sin completar automáticamente la sesión.

Kuco continúa seleccionado de forma predeterminada. Cuando se elige el chibi,
el runtime usa los derivados transparentes de
`electron/assets/avatar-cutout/`; los PNG fuente y su manifiesto de procedencia
permanecen preservados en `electron/assets/avatar-official/`.

El compañero solo recibe un snapshot de presentación sanitizado. No almacena ni
replica las reglas del temporizador: la API de Konea conserva la autoridad y las
acciones de sesión se realizan en la interfaz principal.

Las opciones están disponibles en la sección Configuración y haciendo clic
derecho en el icono de bandeja.
El compañero se arrastra desde el avatar y se abre con el botón “Abrir”; sus
botones aparecen al pasar el puntero o enfocarlos con teclado. Cerrar la ventana principal la oculta cuando
“Cerrar a la bandeja” está activado; para terminar el proceso usa “Salir de
FocusBuddy” en la bandeja.

La ventana local no recibe Node.js ni una función de red genérica. Su preload
solo expone operaciones allowlist de autenticación, academia y estudio. El
proceso principal valida cada operación y usa la sesión persistente de Electron
para comunicarse con el endpoint HTTPS incorporado. La página local aplica una
CSP que impide conexiones de red directas.

## Desarrollo local

La forma directa es ejecutar `iniciar-focusbuddy.bat` desde la raíz. Ese
launcher prepara PostgreSQL y la API, y abre Electron sin iniciar Vite ni la web.
Si la API ya está activa, también puedes ejecutar `npm run focusbuddy`.

La API predeterminada es `http://localhost:3000/api/v1`. Durante el desarrollo
puedes definir `FOCUSBUDDY_API_URL` o usar
`--api-url=https://api.example/api/v1`. HTTP solo se acepta en loopback. Un
ejecutable empaquetado ignora variables y argumentos de endpoint y usa
exclusivamente la configuración incorporada durante el build.

## Instalador de Windows

Define la URL base pública de la API en la terminal que realizará el empaquetado
y ejecuta:

```powershell
$env:FOCUSBUDDY_API_URL = 'https://konea.example/api/v1'
npm run dist:focusbuddy
```

El valor validado se incorpora al instalador como configuración pública (no es
un secreto). El instalador queda en `apps/focusbuddy/release/`. Si no defines la
variable, la compilación queda preparada para la demostración local en
`localhost`.

Para generar y demostrar un instalador contra la API local:

```powershell
Remove-Item Env:FOCUSBUDDY_API_URL -ErrorAction SilentlyContinue
npm run dist:focusbuddy
```

Mantén luego PostgreSQL y la API activos y ejecuta la aplicación instalada. La
interfaz ya forma parte del instalador y no requiere la web, pero este modo no
convierte PostgreSQL ni la API en servicios embebidos. Un instalador para otro
equipo debe apuntar a una API publicada mediante HTTPS.

Un ejecutable empaquetado queda bloqueado al endpoint incorporado: ignora
variables y argumentos de URL para evitar redirigir la sesión a un servidor no
confiable. Para cambiar la API publicada se debe regenerar el instalador. El
comando de distribución comprueba que la configuración y la interfaz local
estén presentes y que los fuses de seguridad esperados hayan quedado aplicados.

El instalador de desarrollo no está firmado. Antes de distribuirlo fuera de la
defensa Capstone se debe configurar firma de código y una estrategia de
actualizaciones verificadas.
