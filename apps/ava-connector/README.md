# Conector AVA experimental

Extensión local Manifest V3 para Edge o Chrome. Lee únicamente materias,
tareas con vencimiento y actividad reciente que ya están visibles en una
pestaña de `https://campusvirtual.duoc.cl/`. Permite seleccionar los datos
importables y genera un archivo JSON para revisarlo nuevamente en Konea.

No lee campos de formulario, contraseñas, cookies, almacenamiento del navegador,
notas, mensajes, compañeros, archivos ni entregas. Tampoco automatiza el inicio
de sesión, evita MFA/CAPTCHA ni llama endpoints internos de Blackboard.

Los únicos permisos MV3 son `activeTab`, `scripting` y `downloads`. No declara
`host_permissions` ni instala un `content_script` permanente: `parser.js` se
inyecta en la pestaña activa únicamente al pulsar el icono y comprueba otra vez
que el host exacto sea `campusvirtual.duoc.cl`. El archivo se guarda localmente;
la extensión nunca llama la API de Konea.

## Instalación de desarrollo

1. Abre `edge://extensions` o `chrome://extensions`.
2. Activa **Modo de desarrollador**.
3. Elige **Cargar extensión sin empaquetar**.
4. Selecciona esta carpeta: `apps/ava-connector`.
5. Inicia sesión en AVA normalmente y abre Cursos, Actividad o Calendario.
6. Pulsa el icono de la extensión, revisa los resultados y expórtalos.
7. En el espacio académico de Konea abre la sincronización AVA, selecciona
   **Importar captura** y confirma los elementos deseados.

El botón **Abrir Konea para importar** apunta a `http://localhost:5173/#academic`
solo en esta versión de desarrollo. Cuando exista un despliegue HTTPS, la URL se
reemplazará durante el empaquetado de la extensión.

La extracción depende de la interfaz visible de Blackboard y podría requerir
ajustes si el proveedor cambia su HTML. El enlace ICS continúa siendo el método
de respaldo.

En la pantalla **Actividad**, la fecha lateral indica cuándo se publicó un
aviso. El popup muestra esas publicaciones en una sección informativa de solo
lectura, pero no las exporta ni inventa una fecha de entrega. El conector solo
propone una tarea cuando el contenido visible incluye una señal explícita de
vencimiento, como `Fecha de entrega` o `Vence`. Para próximas evaluaciones, la
fuente recomendada es **Calendario**.
