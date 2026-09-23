# Conector AVA experimental

## Objetivo y límites

Este MVP reduce la carga manual sin solicitar credenciales institucionales ni
simular una integración oficial de Blackboard. La extensión Manifest V3 lee
únicamente textos, enlaces y fechas que el estudiante ya puede ver en la pestaña
activa de `https://campusvirtual.duoc.cl/`.

No accede a contraseñas, campos de formulario, cookies, tokens, almacenamiento
del navegador, notas, mensajes, compañeros, archivos ni entregas. No automatiza
el inicio de sesión, evita MFA/CAPTCHA ni consume endpoints internos no
documentados. El enlace ICS sigue disponible como respaldo.

## Flujo

1. El estudiante inicia sesión directamente en AVA y abre Cursos, Actividad o
   Calendario.
2. Pulsa el icono del conector. Solo en ese momento se inyecta `parser.js` en la
   pestaña activa.
3. La extensión comprueba el host exacto, elimina credenciales, consulta y
   fragmento de las URLs, recorre nodos visibles y muestra una primera selección
   local.
4. Al confirmar, descarga `konea-ava-AAAA-MM-DD.json`. No realiza ninguna llamada
   a Konea.
5. En Konea, el estudiante arrastra o selecciona el archivo. La API valida origen,
   versión, tamaños, URLs y unicidad, y guarda una vista previa por 24 horas.
6. La interfaz compara materias y actividades con PostgreSQL. El estudiante
   vuelve a seleccionar y pulsa **Confirmar e importar**.
7. La API crea materias con origen `ava_extension` y actividades como pendientes
   académicos. Repetir la misma captura devuelve el resultado existente y no
   duplica datos.

Una captura posterior nunca desactiva materias ausentes ni elimina pendientes.
El estudiante puede editar o archivar lo importado por la extensión. La
sincronización ICS solo administra materias con origen `ava`.

## Permisos MV3

La extensión solicita exclusivamente:

- `activeTab`: acceso temporal a la pestaña elegida mediante un gesto del usuario;
- `scripting`: inyectar el parser únicamente después de ese gesto;
- `downloads`: guardar el JSON que revisó el usuario.

No declara `host_permissions`, `content_scripts`, service worker ni acceso a la
API. Esto evita una excepción para orígenes `chrome-extension://` en el backend:
la carga del archivo la realiza la SPA autenticada de Konea y conserva el control
normal de cookie, CORS y `trustedWriteOrigin`.

El botón **Abrir Konea para importar** usa
`http://localhost:5173/#academic` únicamente en desarrollo. Un paquete para el
despliegue futuro debe sustituir esa URL por el origen HTTPS oficial.

## Formato y persistencia

El JSON versión 1 contiene como máximo 100 materias y 250 actividades. Las URLs
deben usar HTTPS y el host exacto `campusvirtual.duoc.cl`; el servidor elimina
consulta y fragmento antes de almacenar. Una captura puede ocupar hasta 512 KB
en la interfaz y queda además limitada por el body JSON global de 1 MB.

`ava_dom_imports` persiste el hash SHA-256, estado `draft | confirmed | discarded`,
expiración, resultado y la vista previa. Tras confirmar o descartar se eliminan
del borrador los contenidos académicos capturados. `academic_tasks` guarda un
identificador externo con índice único parcial para garantizar idempotencia.
Al preparar cualquier vista previa, la API minimiza de forma oportunista todos
los borradores vencidos de esa cuenta; no depende de un temporizador en memoria.

## Instalación local

Consulta [apps/ava-connector/README.md](../apps/ava-connector/README.md). La
extensión se carga sin empaquetar desde `edge://extensions` o
`chrome://extensions`; este artefacto experimental no se publica automáticamente
en las tiendas de navegadores.

## Fragilidad conocida

El HTML de Blackboard no es un contrato estable. El parser usa selectores
alternativos y pruebas de normalización/deduplicación, pero puede dejar de
reconocer elementos después de una actualización visual. En ese caso debe fallar
sin importar datos, mostrar la vista vacía y ofrecer ICS o carga manual; nunca
debe ampliar permisos o automatizar el acceso como recuperación silenciosa.
