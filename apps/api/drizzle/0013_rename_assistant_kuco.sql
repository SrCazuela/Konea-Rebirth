ALTER TYPE "public"."duco_draft_kind" RENAME TO "kuco_draft_kind";--> statement-breakpoint
ALTER TYPE "public"."duco_draft_status" RENAME TO "kuco_draft_status";--> statement-breakpoint
ALTER TABLE "duco_drafts" RENAME TO "kuco_drafts";--> statement-breakpoint
ALTER TABLE "kuco_drafts" RENAME CONSTRAINT "duco_drafts_user_id_users_id_fk" TO "kuco_drafts_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "kuco_drafts" RENAME CONSTRAINT "duco_drafts_source_message_id_assistant_messages_id_fk" TO "kuco_drafts_source_message_id_assistant_messages_id_fk";
--> statement-breakpoint
ALTER TABLE "kuco_drafts" RENAME CONSTRAINT "duco_drafts_pkey" TO "kuco_drafts_pkey";--> statement-breakpoint
ALTER INDEX "duco_drafts_source_message_unique" RENAME TO "kuco_drafts_source_message_unique";--> statement-breakpoint
ALTER INDEX "duco_drafts_user_status_updated_at_index" RENAME TO "kuco_drafts_user_status_updated_at_index";--> statement-breakpoint
ALTER INDEX "duco_drafts_expires_at_index" RENAME TO "kuco_drafts_expires_at_index";--> statement-breakpoint

-- Only display text changes. Message IDs, draft states, request relationships,
-- credentials and timestamps remain intact. The temporary helper is scoped to
-- this migration connection and never becomes an application database object.
CREATE FUNCTION pg_temp.kuco_brand(value text) RETURNS text
LANGUAGE sql IMMUTABLE STRICT AS $$
  SELECT regexp_replace(
    regexp_replace(
      regexp_replace(value, '\mDUCO\M', 'KUCO', 'g'),
      '\mDuco\M', 'Kuco', 'g'),
    '\mduco\M', 'kuco', 'g');
$$;--> statement-breakpoint

UPDATE "assistant_messages"
SET "content" = pg_temp.kuco_brand("content"),
    "action" = pg_temp.kuco_brand("action"::text)::jsonb
WHERE "content" ~* '\mduco\M' OR "action"::text ~* '\mduco\M';--> statement-breakpoint

UPDATE "kuco_drafts"
SET "payload" = pg_temp.kuco_brand("payload"::text)::jsonb
WHERE "payload"::text ~* '\mduco\M';--> statement-breakpoint

UPDATE "notifications"
SET "title" = pg_temp.kuco_brand("title"),
    "body" = pg_temp.kuco_brand("body"),
    "href" = regexp_replace(pg_temp.kuco_brand("href"), '^duco-request:', 'kuco-request:', 'i')
WHERE "title" ~* '\mduco\M' OR "body" ~* '\mduco\M' OR "href" ~* '\mduco\M';--> statement-breakpoint

UPDATE "support_requests"
SET "subject" = pg_temp.kuco_brand("subject"),
    "description" = pg_temp.kuco_brand("description"),
    "desired_outcome" = pg_temp.kuco_brand("desired_outcome")
WHERE "subject" ~* '\mduco\M' OR "description" ~* '\mduco\M' OR "desired_outcome" ~* '\mduco\M';--> statement-breakpoint

UPDATE "support_request_events" SET "note" = pg_temp.kuco_brand("note")
WHERE "note" ~* '\mduco\M';--> statement-breakpoint

UPDATE "tasks" SET "title" = pg_temp.kuco_brand("title"), "description" = pg_temp.kuco_brand("description")
WHERE "title" ~* '\mduco\M' OR "description" ~* '\mduco\M';--> statement-breakpoint

UPDATE "academic_tasks" SET "title" = pg_temp.kuco_brand("title"), "description" = pg_temp.kuco_brand("description")
WHERE "title" ~* '\mduco\M' OR "description" ~* '\mduco\M';--> statement-breakpoint

UPDATE "messages" SET "content" = pg_temp.kuco_brand("content")
WHERE "content" ~* '\mduco\M';--> statement-breakpoint

UPDATE "posts" SET "content" = pg_temp.kuco_brand("content")
WHERE "content" ~* '\mduco\M';--> statement-breakpoint

UPDATE "comments" SET "content" = pg_temp.kuco_brand("content")
WHERE "content" ~* '\mduco\M';--> statement-breakpoint

UPDATE "polls" SET "question" = pg_temp.kuco_brand("question")
WHERE "question" ~* '\mduco\M';--> statement-breakpoint

UPDATE "poll_options" SET "label" = pg_temp.kuco_brand("label")
WHERE "label" ~* '\mduco\M';
