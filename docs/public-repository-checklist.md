# Publicación segura del repositorio

El repositorio de Capstone puede ser público y conservar la documentación del
proyecto. Ser público no exige publicar credenciales ni enlaces privados.

## Nunca versionar

- `.env`, API keys de OpenAI u otros proveedores;
- contraseñas reales, cookies, tokens o cadenas de conexión productivas;
- enlaces ICS personales de AVA: el identificador del feed funciona como token;
- contenido de `.local/`, bases, uploads, cachés o perfiles de Electron;
- capturas que muestren secretos, aunque luego se borre el texto visible.

El repositorio ya ignora esos archivos y `.env.example` solo contiene valores de
referencia. Si un secreto se publica alguna vez, borrarlo en un commit nuevo no
basta: debe revocarse en el proveedor y reemplazarse.

## Antes de cada push

1. Ejecutar `npm run check`.
2. Revisar `git status --short` y `git diff --check`.
3. Confirmar que los cambios de `.env` no aparecen en Git.
4. Buscar accidentalmente prefijos de claves, contraseñas y URLs de calendario.
5. Revisar manualmente metadatos y contenido de PDF/DOCX que se quieran publicar.

Los nombres de autores y datos académicos incluidos deliberadamente en los
documentos son una decisión del equipo. Conviene publicar solo lo que sea
necesario para evaluar el proyecto y contar con el consentimiento de cada
persona identificable.

## Configuración de demostración

La cuenta `admin` / `admin` solo se crea en desarrollo local y el script rechaza
una base remota. Antes de desplegar, usa `NODE_ENV=production`, credenciales
únicas, HTTPS y secretos administrados por la plataforma de hosting.

`FOCUSBUDDY_APP_URL` no es secreto: es la dirección pública de Konea que el
instalador abre. En una entrega web debe ser HTTPS.
