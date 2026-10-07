# Anexo de base de datos — Konea Rebirth

Fecha de generación: 5 de octubre de 2026  
Motor: PostgreSQL 17.11  
Origen: instancia temporal aislada `konea-evidence`

## Propósito

Este anexo permite revisar la definición completa de la base de datos y restaurar una instantánea demostrativa de Konea sin publicar información personal de la instancia de desarrollo.

La instantánea se generó desde una base nueva. Se aplicaron las 13 migraciones oficiales del repositorio y únicamente el seed social ficticio. No se volcó la base de trabajo utilizada por el equipo.

## Archivos

| Archivo | Contenido | Uso recomendado |
|---|---|---|
| `01_KONEA_Esquema_Base_Datos_PostgreSQL.sql` | DDL legible: esquemas, 25 enums, tablas, secuencias, claves primarias y foráneas, restricciones e índices. | Revisar el `CREATE TABLE` y crear una base vacía sin datos. |
| `02_KONEA_Base_Datos_Demo_Completa.sql` | Respaldo lógico completo en texto: estructura, journal de migraciones y datos ficticios. | Restauración simple mediante `psql`. |
| `03_KONEA_Base_Datos_Demo_Completa.dump` | El mismo respaldo completo en formato personalizado y comprimido de `pg_dump`. | Restauración selectiva o completa mediante `pg_restore`. |
| `Consultas_SQL_Seguras.sql` | Consultas de solo lectura para inspeccionar la evidencia. | Validar tablas, relaciones y métricas sin modificar datos. |
| `SHA256SUMS.txt` | Huellas SHA-256 de los archivos entregados. | Comprobar que los respaldos no fueron alterados. |

> `01` y `02` son alternativas. No deben ejecutarse consecutivamente sobre la misma base: `01` crea únicamente la estructura y `02` ya contiene esa misma estructura junto con los datos.

## Contenido estructural

- 32 tablas funcionales en el esquema `public`.
- 1 tabla adicional `drizzle.__drizzle_migrations` para el journal de migraciones.
- 258 columnas funcionales.
- 25 tipos enumerados.
- 56 claves foráneas.
- 9 restricciones `CHECK`.
- 86 índices en total.
- 47 índices únicos, incluyendo 32 índices de claves primarias y 15 índices únicos adicionales.
- 13 migraciones aplicadas, desde `0000` hasta `0012`.

## Datos ficticios incluidos

- 13 usuarios y 13 perfiles ficticios.
- 12 registros de archivos demostrativos; corresponden únicamente a metadatos y rutas.
- 22 publicaciones.
- 41 comentarios.
- 150 reacciones.

El resto de las tablas queda vacío intencionalmente. Esto permite mostrar todas las estructuras sin publicar sesiones, conversaciones, mensajes de DUCO, solicitudes de bienestar, reportes, calendarios AVA o sesiones de estudio pertenecientes a pruebas reales.

La cuenta local `admin/admin` tampoco está incluida. Si se restaura la base en un entorno local de desarrollo y se necesita esa cuenta para una demostración, debe generarse después mediante:

```powershell
npm run db:seed:dev
```

## Restaurar el SQL completo

Los siguientes comandos requieren PostgreSQL y una base vacía:

```powershell
createdb -U postgres konea_evidence
psql -v ON_ERROR_STOP=1 -U postgres -d konea_evidence -f "02_KONEA_Base_Datos_Demo_Completa.sql"
```

Si el usuario de PostgreSQL no se llama `postgres`, debe reemplazarse por el usuario correspondiente.

## Restaurar el archivo `.dump`

```powershell
createdb -U postgres konea_evidence
pg_restore --exit-on-error --no-owner --no-privileges -U postgres -d konea_evidence "03_KONEA_Base_Datos_Demo_Completa.dump"
```

## Crear solo la estructura

```powershell
createdb -U postgres konea_schema
psql -v ON_ERROR_STOP=1 -U postgres -d konea_schema -f "01_KONEA_Esquema_Base_Datos_PostgreSQL.sql"
```

## Validación realizada

El respaldo SQL completo y el archivo `.dump` fueron restaurados en bases temporales independientes. Ambas restauraciones terminaron sin errores y devolvieron:

```text
tablas públicas: 32
migraciones: 13
usuarios ficticios: 13
sesiones: 0
publicaciones: 22
comentarios: 41
reacciones: 150
reportes: 0
solicitudes: 0
```

## Diferencia respecto de las capturas de evidencia

El documento de evidencia de base de datos muestra la instancia local utilizada durante el desarrollo, que puede contener una cantidad mayor de registros y módulos ejercitados. Los respaldos de este anexo corresponden a una instantánea demostrativa independiente y saneada para entrega. Por ese motivo sus conteos no tienen que coincidir con las capturas.

## Archivos multimedia

PostgreSQL conserva los metadatos de los 12 archivos demostrativos, pero las imágenes binarias no se almacenan dentro de la base. Los activos fuente permanecen en:

```text
apps/api/demo-assets/social
```

Su origen y atribución están documentados en:

```text
docs/demo-content-attribution.md
```

No se incluyeron `.env`, claves de API, contraseñas de PostgreSQL, cookies, tokens ni archivos de `.local/uploads`.
