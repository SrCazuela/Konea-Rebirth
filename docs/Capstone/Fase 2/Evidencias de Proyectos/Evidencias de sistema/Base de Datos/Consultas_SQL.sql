-- KONEA Focus · Evidencia de base de datos
-- Consultas de solo lectura verificadas el 05-10-2026.
-- No muestran contraseñas, tokens, correos ni contenido privado.

BEGIN TRANSACTION READ ONLY;

-- 1. Identificación y modo de la sesión.
SELECT current_database() AS base,
       current_user AS usuario,
       current_setting('server_version') AS version,
       current_setting('TimeZone') AS zona_horaria,
       current_setting('transaction_read_only') AS solo_lectura,
       pg_size_pretty(pg_database_size(current_database())) AS tamano;

-- 2. Inventario estructural.
SELECT
  (SELECT count(*) FROM information_schema.tables
   WHERE table_schema = 'public' AND table_type = 'BASE TABLE') AS tablas,
  (SELECT count(*) FROM information_schema.columns
   WHERE table_schema = 'public') AS columnas,
  (SELECT count(*) FROM pg_constraint
   WHERE contype = 'f' AND connamespace = 'public'::regnamespace) AS claves_foraneas,
  (SELECT count(*) FROM pg_indexes
   WHERE schemaname = 'public') AS indices,
  (SELECT count(*) FROM pg_constraint
   WHERE contype = 'c' AND connamespace = 'public'::regnamespace) AS checks,
  (SELECT count(*)
   FROM pg_class c
   JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity) AS tablas_con_rls;

-- 3. Lista de tablas.
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
ORDER BY table_name;

-- 4. Migraciones registradas. Se muestra solo un prefijo del hash.
SELECT id,
       left(hash, 12) AS hash_prefijo,
       to_timestamp(created_at / 1000.0) AS timestamp_migracion
FROM drizzle.__drizzle_migrations
ORDER BY id;

-- 5. Evidencia agregada de hashes; no revela secretos.
SELECT count(*) AS usuarios,
       count(*) FILTER (
         WHERE password_hash LIKE 'scrypt$16384$8$1$%'
       ) AS hashes_scrypt,
       count(*) FILTER (
         WHERE password_hash IS NULL OR btrim(password_hash) = ''
       ) AS hashes_faltantes
FROM users;

SELECT count(*) AS sesiones,
       count(*) FILTER (
         WHERE length(token_hash) = 64
           AND token_hash ~ '^[0-9a-f]{64}$'
       ) AS tokens_sha256
FROM user_sessions;

-- 6. Restricciones CHECK legibles.
SELECT conrelid::regclass AS tabla,
       conname AS restriccion,
       pg_get_constraintdef(oid) AS definicion
FROM pg_constraint
WHERE contype = 'c' AND connamespace = 'public'::regnamespace
ORDER BY tabla::text, restriccion;

-- 7. Resumen funcional sin datos personales.
SELECT 'usuarios' AS entidad, count(*) AS total FROM users
UNION ALL SELECT 'publicaciones', count(*) FROM posts
UNION ALL SELECT 'comentarios', count(*) FROM comments
UNION ALL SELECT 'mensajes', count(*) FROM messages
UNION ALL SELECT 'cursos', count(*) FROM academic_courses
UNION ALL SELECT 'pendientes_academicos', count(*) FROM academic_tasks
UNION ALL SELECT 'sesiones_estudio', count(*) FROM study_sessions
UNION ALL SELECT 'borradores_duco', count(*) FROM duco_drafts
UNION ALL SELECT 'solicitudes_soporte', count(*) FROM support_requests;

-- 8. Persistencia DUCO -> tarea.
SELECT d.status,
       count(*) AS total,
       count(t.id) AS enlazados_a_tarea
FROM duco_drafts d
LEFT JOIN academic_tasks t
  ON d.kind = 'task' AND d.completed_resource_id = t.id
WHERE d.kind = 'task'
GROUP BY d.status
ORDER BY d.status;

-- 9. FocusBuddy: sesiones con su historial.
SELECT s.status,
       count(DISTINCT s.id) AS sesiones,
       count(e.id) AS eventos
FROM study_sessions s
LEFT JOIN study_session_events e ON e.session_id = s.id
GROUP BY s.status
ORDER BY s.status;

ROLLBACK;
