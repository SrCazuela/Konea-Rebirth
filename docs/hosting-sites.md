# Alojamiento de demostración: Sites, Render y Neon

Estado al 2 de noviembre de 2026: frontend y adaptador preparados y compilados;
versión 1 de Sites guardada con acceso solo al propietario, sin publicar.
El proyecto Neon gratuito y el bucket privado están creados. La publicación
integral sigue pendiente de verificar la copia remota y confirmar que Render
no pueda generar cargos automáticos. Esto no constituye todavía una demo operativa.

## Arquitectura

```mermaid
flowchart LR
  B[Navegador] --> S[ChatGPT Sites: frontend React y proxy HTTP]
  S -->|HTTPS y secreto del servidor| R[Render: API Express]
  R --> N[Neon: PostgreSQL]
  R --> O[Neon: bucket privado de archivos]
  R --> A[OpenAI: DUCO]
  L[Entorno local: Vite, API y Docker] --> P[PostgreSQL local independiente]
```

Se conservan React, TypeScript, Vite, Express, PostgreSQL y Drizzle. El adaptador
de publicación usa el starter Vinext de Sites; no reemplaza las pantallas de
Konea. Sites recibe el frontend compilado, nunca el respaldo de la base de datos.
La conexión PostgreSQL y la IA se ejecutan en Render. En producción, las imágenes
y adjuntos usan almacenamiento de objetos privado, ya que el disco gratuito de
Render es temporal.

Checkout independiente de Sites: `D:\konea-rebirth\Konea-Sites-Demo`.
Su `.openai/hosting.json` conserva la identidad del proyecto y declara `d1: null`
y `r2: null`: este despliegue mantiene PostgreSQL en Neon.

## Conexiones y credenciales

Conectar los plugins de Neon y Render permite administrar los recursos desde
ChatGPT sin enviar contraseñas por el chat. OpenAI Developers permite configurar
el acceso de DUCO por el flujo de credenciales de OpenAI.

Los valores se configuran como secretos del proveedor. El archivo
`hosting/hosting.env.example` contiene únicamente los nombres que necesitan las
herramientas de copia. Si se usa configuración manual, copiarlo a
`.env.hosting.local`, que está ignorado por Git. El `.env` de desarrollo se mantiene.

| Destino                   | Configuración                                                                                                                                                                      |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sites                     | `KONEA_BACKEND_ORIGIN`: origen HTTPS exacto del servicio Render; `SITES_BACKEND_TOKEN`: secreto compartido con Render.                                                             |
| Render                    | `DATABASE_URL`: conexión Neon con TLS; `CORS_ORIGIN`: origen de Sites; `SITES_BACKEND_TOKEN`: mismo secreto; `UPLOAD_STORAGE=s3`; variables `S3_*`; credenciales y modelo de DUCO. |
| Herramientas de migración | `HOSTED_DATABASE_URL`: destino remoto nuevo; las mismas variables `S3_*` del bucket privado.                                                                                       |

No incluir claves de OpenAI, acceso S3, credenciales de PostgreSQL o el secreto
del proxy en variables `VITE_*`, instaladores, repositorios, capturas ni documentos.

## Orden de despliegue y copia

1. Crear una base PostgreSQL **nueva y vacía** y un bucket privado en Neon.
   Seleccionar una región compatible con Object Storage y cercana a la API.
2. Crear un respaldo de la base local y los archivos:

   ```powershell
   node scripts/hosting/export-local-database.mjs
   node scripts/hosting/verify-local-backup.mjs --backup '<carpeta del respaldo>'
   ```

3. Restaurar la copia antes del primer arranque de Render:

   ```powershell
   node scripts/hosting/restore-hosted-database.mjs --backup '<carpeta del respaldo>' --sessions include
   ```

   El script comprueba SHA-256, exige TLS y un destino remoto vacío, y aplica una
   transacción con validación de conteos. No usa `--clean` ni escribe en la base
   local. Es obligatorio elegir `--sessions include` o `--sessions exclude`:
   `include` conserva también los registros de sesiones y requiere autorización
   expresa; `exclude` conserva todas las demás tablas y deja vacías las sesiones
   de acceso. La herramienta rechaza una política omitida o desconocida antes
   de leer credenciales o conectar. Se puede inyectar `LOCAL_DATABASE_URL` como
   identidad del origen en memoria, sin copiar su archivo `.env`.

   El respaldo contiene 583 filas, incluidas 17 de `user_sessions`; la copia
   completa verifica 583 filas y la exclusión explícita verifica 566, antes de
   migraciones posteriores. Las sesiones guardan hashes SHA-256 del token.
   Copiar esos registros no traslada la cookie del navegador al nuevo dominio:
   puede ser necesario iniciar sesión de nuevo aunque se conserven los datos.
   Las cookies del navegador no se exportan ni se cambia su dominio.

4. Copiar los archivos del mismo respaldo al bucket mediante
   `scripts/hosting/import-hosted-uploads.mjs`. Conservar nombres y rutas de la
   API. Verificar el resultado antes de habilitar acceso a la demo.
5. Crear el servicio gratuito con `render.yaml` y `Dockerfile.api`, completar
   secretos y arrancar. Las migraciones se aplican antes de escuchar HTTP;
   **no** se ejecutan seeders ni se crean cuentas `admin/admin` en el arranque.
   No arrancar contra una base vacía antes del paso de restauración: las
   migraciones crearían objetos y la restauración rechazaría el destino.
6. Configurar el origen de Render y el secreto del proxy en Sites. Preparar
   cambios del frontend con:

   ```powershell
   node scripts/hosting/prepare-sites.mjs --directory 'D:\konea-rebirth\Konea-Sites-Demo'
   ```

   Publicar con el flujo de Sites conservando el mismo `project_id` y el acceso
   privado. No volver a crear el proyecto para cada actualización.

El respaldo inicial verificado contiene 33 tablas, 583 filas y 64 adjuntos.
Los archivos completos y la evidencia están en `.local/hosting/`; esa carpeta
está ignorada por Git y no se incluye en la imagen Docker ni en Sites.

## Acceso y verificación

Sites conserva su control de acceso y las cuentas de Konea conservan sus roles
y permisos. El proxy transmite solamente `konea_session`; nunca reenvía cookies,
autorizaciones ni identidad de ChatGPT al backend. La API exige el secreto del
proxy cuando está configurado, excepto en el healthcheck básico.

Antes de dar la demo por terminada verificar, con una cuenta estudiantil y otra
administrativa: login/logout, sesión persistente, foro e imágenes, chat y
adjuntos, materias/tareas, solicitudes, métricas de estudio, permisos entre
usuarios y DUCO. Probar archivos después de reiniciar Render. Comprobar que una
petición directa a Render sin el secreto no permite leer datos ni consumir IA.

Las pruebas locales de este cambio cubren restauración completa, integridad de
archivos, transacción de copia, protección del destino, proxy y cookies. Las
pruebas en los proveedores quedan pendientes hasta tener las conexiones.

## Desarrollo y límites

Las bases son independientes: crear una tarea en la demo no modifica la base
local y viceversa. Una actualización de código no vuelve a importar el respaldo.
No intentar sincronizar bases mediante restauraciones repetidas sobre datos
existentes. Las nuevas migraciones se aplican por separado en cada entorno.

Neon conserva su plan Free sin contratar recursos de pago. Render Free puede
suspender la API tras 15 minutos sin tráfico y tardar aproximadamente un minuto
en reactivarse. Si hay un método de pago, Render puede cobrar excesos de ancho
de banda o minutos de compilación: el nombre del plan no garantiza factura cero.
Antes de desplegar con requisito de costo cero, comprobar que no hay método de
pago ni compras automáticas. Un límite de gasto de compilación no limita los
cargos de ancho de banda. No añadir tarjetas ni cambiar a planes de pago.

Los niveles gratuitos tienen cuotas, suspensiones y arranques en frío; no se
garantiza disponibilidad continua ni hasta una fecha de presentación concreta.
La API OpenAI de DUCO utiliza créditos aparte: reutilizar la clave requiere
autorización y no convierte las consultas en gratuitas. No se ejecutan pruebas
facturables de DUCO sin autorización específica.

FocusBuddy de escritorio conserva su configuración local. Esta primera
integración privada de Sites no permite que el instalador existente acceda al
backend protegido: hará falta resolver el acceso de escritorio y generar y
probar otro instalador. **Nunca** incorporar el secreto del proxy al cliente.

La Fase 1 ya evaluada no se modifica. En la Fase 2, el informe 2.4, el 2.6 y el
manual de despliegue deben distinguir esta preparación de un despliegue remoto
efectivamente validado. El modelo de datos PostgreSQL se conserva.

## Herramientas PostgreSQL en Windows

La restauración puede usar herramientas PostgreSQL 17 portátiles cuando Docker
no está disponible. Obtener el archivo ZIP de binarios desde la
[descarga oficial de PostgreSQL para Windows](https://www.postgresql.org/download/windows/)
y comprobar su suma de verificación publicada antes de ejecutar sus programas.
No hace falta instalar un servidor ni modificar la base local.

```powershell
$env:PG_TOOLS_DIRECTORY = 'C:\tools\postgresql\bin'
node scripts/hosting/restore-hosted-database.mjs --backup '<carpeta del respaldo>' --sessions include
```

El directorio debe contener `pg_restore.exe` y `psql.exe`. Esta ruta conserva las
mismas comprobaciones y la transacción única de restauración; las credenciales
se pasan al cliente en memoria, sin argumentos ni registros de consola. Si no
se configura `PG_TOOLS_DIRECTORY`, se conserva la ruta mediante Docker.

## Referencias oficiales

- [Sites: conexiones y almacenamiento](https://learn.chatgpt.com/docs/sites/data-and-connections).
- [Render: servicios gratuitos y disco temporal](https://render.com/docs/free).
- [Neon: planes y límites](https://neon.com/pricing).
- [Neon: Object Storage](https://neon.com/docs/storage/overview).
