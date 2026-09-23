# Konea FocusBuddy para escritorio

Este cliente abre el espacio FocusBuddy de Konea en una ventana de escritorio
aislada. La sesión se conserva en un perfil propio de Electron y el proceso no
expone APIs de Node.js a la interfaz web.

La aplicación incorpora:

- ventana principal y modo compacto sobre la misma interfaz y sesión;
- compañero flotante transparente con avatar provisional propio;
- bandeja del sistema y cierre opcional a la bandeja;
- preferencias locales de tamaño, posición, animación y siempre visible;
- inicio opcional con Windows en la versión instalada;
- aviso nativo opt-in al llegar a cero, sin completar automáticamente la sesión.

El compañero solo recibe un snapshot de presentación sanitizado. No almacena ni
replica las reglas del temporizador: la API de Konea conserva la autoridad y las
acciones de sesión se realizan en la interfaz principal.

Las opciones están disponibles haciendo clic derecho en el icono de bandeja.
El compañero se arrastra desde el avatar y se abre con el botón “Abrir”; sus
botones aparecen al pasar el puntero o enfocarlos con teclado. Cerrar la ventana principal la oculta cuando
“Cerrar a la bandeja” está activado; para terminar el proceso usa “Salir de
FocusBuddy” en la bandeja.

El alcance funcional, el contrato de sesiones y la ruta de sustitución del
avatar están documentados en [docs/focusbuddy.md](../../docs/focusbuddy.md).

## Desarrollo local

1. Inicia Konea con `iniciar.bat`.
2. En otra terminal ejecuta `npm run focusbuddy` desde la raíz.

La dirección predeterminada es `http://localhost:5173/#focusbuddy`. Durante el
desarrollo puedes definir `FOCUSBUDDY_APP_URL` o usar
`--app-url=https://tu-dominio.example`; el launcher
`iniciar-focusbuddy.bat` fuerza deliberadamente la instancia local que acaba de
levantar. HTTP solo se acepta para `localhost`.

## Instalador de Windows

Define la URL pública en la terminal que realizará el empaquetado y ejecuta:

```powershell
$env:FOCUSBUDDY_APP_URL = 'https://konea.example'
npm run dist:focusbuddy
```

El valor validado se incorpora al instalador como configuración pública (no es
un secreto). El instalador queda en `apps/focusbuddy/release/`. Si no defines la
variable, la compilación queda preparada para la demostración local en
`localhost`.

Para generar y demostrar ese instalador sin hosting:

```powershell
Remove-Item Env:FOCUSBUDDY_APP_URL -ErrorAction SilentlyContinue
npm run dist:focusbuddy
```

Mantén luego `iniciar.bat` abierto y ejecuta la aplicación instalada. Esta
modalidad depende de la API y la web locales; no convierte el instalador en una
aplicación autónoma. Para el trabajo diario, `iniciar-focusbuddy.bat` levanta los
servicios y abre directamente el shell Electron de desarrollo. Un instalador
para otro equipo requiere publicar web/API y volver a empaquetar con una URL
HTTPS.

Un ejecutable empaquetado queda bloqueado al endpoint incorporado: ignora
variables y argumentos de URL para evitar que un acceso directo malicioso
muestre una página de phishing dentro de una ventana con la marca Konea. Para
cambiar el servidor publicado se debe regenerar el instalador. El comando de
distribución comprueba además que la configuración esté presente y que los fuses
de seguridad esperados hayan quedado aplicados.

El instalador de desarrollo no está firmado. Antes de distribuirlo fuera de la
defensa Capstone se debe configurar firma de código y una estrategia de
actualizaciones verificadas.
