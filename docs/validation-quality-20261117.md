# Validación y calidad de Konea

La revisión local del **17 de noviembre de 2026** registra **462 pruebas
automatizadas aprobadas**, auditorías de ejecución y desarrollo con cero alertas
y recorridos de cuenta, móvil y accesibilidad. La evaluación de uso con
lectores de pantalla y en dispositivos físicos se mantiene pendiente.

## Versión y alcance

La retroalimentación que motivó esta revisión corresponde a la **práctica
laboral**, cuyo equipo es **Oscar, Esteban y Danae**. Para **Capstone final**,
el equipo es **Oscar, Hilary y Danae**. Oscar confirmó ambas nóminas el
17 de noviembre de 2026. Las comprobaciones técnicas son evidencias del mismo
proyecto; las responsabilidades y aportaciones se registran por separado para
cada contexto en el [seguimiento del equipo](./team-deliverables.md).

La base Git es `49578d07e8efd04afb4f50ed795cc2f42b5d1ab6`, con cambios de trabajo sin commit.
El expediente conserva resultados y hashes para identificar lo efectivamente
probado; el hash base por sí solo no representa los cambios locales. La
ejecución utilizó Windows de 64 bits, Node 24.15.0 y PostgreSQL 17 en un
contenedor desechable. Se crearon datos sintéticos y una
base desechable. La limpieza queda registrada en `Ejecucion_Reproducible/ejecucion-local.json`.

Esta revisión no publica código ni modifica la base oficial. El corte remoto
verificado del 11 de noviembre sigue siendo Sites v5 y FocusBuddy 0.1.3. Las
303 pruebas del 9 de noviembre y los cortes de 420 del 11 de noviembre se
conservan como resultados históricos de sus ejecuciones.

## Dependencias y auditorías

La revisión inicial del día encontró cero alertas de ejecución y diez
moderadas en herramientas de desarrollo. Tras la corrección, ambas auditorías
devuelven cero. El detalle de paquetes y cambios está en el expediente de
Seguridad; la cifra histórica de seis alertas del informe anterior no se
reutiliza como resultado actual.

| Auditoría                     | Antes        | Después |
| ----------------------------- | ------------ | ------- |
| `npm audit --omit=dev --json` | 0            | 0       |
| `npm audit --json`            | 10 moderadas | 0       |

Una auditoría sin avisos conocidos no constituye una garantía absoluta de
seguridad. El resultado depende del árbol instalado, el lockfile y los avisos
disponibles al ejecutar el comando.

## Repetición y control de versiones

El comando versionado es `npm run quality:local -- --output <carpeta-nueva>`.
Requiere Node, npm, Git, Docker y Edge; las herramientas de navegador
`playwright-core` y `axe-core` deben estar instaladas en
`.local/browser-tools`, o indicarse con `KONEA_BROWSER_TOOLS`. El script
crea su base desechable, usa loopback, conserva los resultados y rechaza
sobrescribir una carpeta de ejecución previa.

CI incluye auditoría de ejecución y de desarrollo con umbral moderado, y
conserva los registros como `validation-${{ github.sha }}` durante 30 días.
El workflow actualizado aún no se ha ejecutado en GitHub; se comprobó la
ejecución local. Los cambios siguen sin commit ni push en este corte.

## Regresión técnica

Desglose de la ejecución: **API 197, AVA 18, FocusBuddy 114, web 82, sincronización documental 32 y hosting/proxy 19**. Los recorridos de navegador
y el guion manual se registran por separado; no se suman a esa cifra.

| Comando                | Resultado | Registro completo                                          |
| ---------------------- | --------- | ---------------------------------------------------------- |
| `npm run db:check`     | AP        | `Ejecucion_Reproducible/Logs/01-migration-consistency.log` |
| `npm run db:migrate`   | AP        | `Ejecucion_Reproducible/Logs/02-migration-apply.log`       |
| `npm run db:migrate`   | AP        | `Ejecucion_Reproducible/Logs/03-migration-idempotency.log` |
| `npm run lint`         | AP        | `Ejecucion_Reproducible/Logs/04-lint.log`                  |
| `npm run typecheck`    | AP        | `Ejecucion_Reproducible/Logs/05-types.log`                 |
| `npm run test`         | AP        | `Ejecucion_Reproducible/Logs/06-tests.log`                 |
| `npm run build`        | AP        | `Ejecucion_Reproducible/Logs/07-build.log`                 |
| `npm run format:check` | AP        | `Ejecucion_Reproducible/Logs/08-format.log`                |

## Pruebas funcionales de esta revisión

Los casos T07 a T16 se automatizaron sobre Edge real, API local y PostgreSQL
aislado. Las capturas y los detalles observados están relacionados con cada
caso en `Ejecucion_Reproducible/Pruebas_Funcionales/resultados.json`. T01 a T06 conservan su
expediente del 9 de noviembre y no se presentan como una repetición del día 17.

| Caso | Escenario                                                                  | Resultado |
| ---- | -------------------------------------------------------------------------- | --------- |
| T07  | Portada y acceso en resoluciones móviles de 320 a 412 px                   | AP        |
| T08  | Teclado foco Escape retorno y visibilidad de contraseña                    | AP        |
| T09  | Registro real y sesión con cookie                                          | AP        |
| T10  | Contraseña actual incorrecta y persistencia de cambios de cuenta           | AP        |
| T11  | Cambio de contraseña rechazo de clave anterior y revocación de otra sesión | AP        |
| T12  | Configuración de cuenta y guardado en resoluciones móviles                 | AP        |
| T13  | Zoom real del navegador al 200 por ciento y guardado con redistribución    | AP        |
| T14  | Navegación mediante teclado y movimiento reducido                          | AP        |
| T15  | Fallo de salida conserva sesión y cierre correcto revoca acceso            | AP        |
| T16  | Inspección semántica automatizada de las pantallas comprobadas             | AP        |

El caso T15 inyecta una respuesta 503 en el navegador para comprobar que la
interfaz conserva la sesión ante un fallo y después ejecuta una salida real.
Esa inyección no acredita una caída completa de la API. El movimiento reducido
se emula como preferencia del navegador, sin cambiar Windows.

La comprobación de móvil emula resoluciones CSS; no acredita una ejecución
en un teléfono Android físico. El caso de ampliación debe leerse con sus
métricas de zoom y viewport, conservadas en el resultado. Los errores de
JavaScript observados fueron 0.

## Accesibilidad y límites de la evidencia

Se inspeccionaron cinco pantallas con comprobaciones semánticas automatizadas.
Axe reportó cero infracciones confirmadas en esos estados. El resultado se
limita a las pantallas probadas y no declara conformidad global con WCAG.

El motor dejó ocho comprobaciones incompletas: 192 ocurrencias de contraste y
tres de atributos ARIA. Son 195 ocurrencias de nodos, con repeticiones entre
pantallas, pendientes de revisión humana. Se conserva especialmente la
revisión manual de contraste sobre fondos con gradientes.

La prueba auditiva y de uso con **NVDA y TalkBack permanece NE**. El
[guion de lectores de pantalla](./screen-reader-checklist.md) define diez casos
y la información que debe registrar el ejecutor. Los roles y nombres
accesibles o un escaneo automatizado no sustituyen esa evaluación.

NVDA y TalkBack, contraste manual sobre gradientes, Android físico, Windows 10, instalación limpia formal y aceptación con usuarios siguen pendientes. La revisión no acredita conformidad global con WCAG.

## Evidencias y participación

El expediente de revisión completo está en
`D:\konea-rebirth\evidencias sistema\Validacion_Calidad_2026-11-17`.
La copia depurada versionable se encuentra en
`docs/Capstone/Fase 3/Evidencias de Proyectos/Evidencias de sistema/Validacion_Calidad_2026-11-17`: auditorías, resumen JSON, matriz CSV y checksums.
La copia incluye los registros y las capturas finales; los intentos previos,
los perfiles de navegador y los temporales permanecen fuera del repositorio.

El [seguimiento del equipo](./team-deliverables.md) distingue responsabilidades
documentadas, autoría Git y evidencias pendientes de acreditar. La ejecución
asistida no se atribuye como prueba manual realizada por un integrante. Las
fases previamente evaluadas y los diarios personales permanecen intactos.

Los cinco Word vigentes de Fase 3 se actualizaron solo en texto, con respaldo
y renderizado antes y después. Cada documento conserva sus cinco páginas.
Se verificaron la estructura de formato y las partes no textuales antes de
aplicar las copias definitivas. Publicar estos cambios en GitHub y desplegarlos
son operaciones posteriores.
