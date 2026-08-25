CREATE TABLE "connections" (
	"user_one_id" uuid NOT NULL,
	"user_two_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "connections_user_one_id_user_two_id_pk" PRIMARY KEY("user_one_id","user_two_id"),
	CONSTRAINT "connections_canonical_pair" CHECK ("connections"."user_one_id" < "connections"."user_two_id")
);
--> statement-breakpoint
ALTER TABLE "follows" RENAME TO "connection_intents";--> statement-breakpoint
ALTER TABLE "connection_intents" RENAME COLUMN "follower_id" TO "requester_id";--> statement-breakpoint
ALTER TABLE "connection_intents" RENAME COLUMN "following_id" TO "recipient_id";--> statement-breakpoint
ALTER TABLE "connection_intents" DROP CONSTRAINT "follows_cannot_follow_self";--> statement-breakpoint
ALTER TABLE "connection_intents" DROP CONSTRAINT "follows_follower_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "connection_intents" DROP CONSTRAINT "follows_following_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "notifications" ALTER COLUMN "type" SET DATA TYPE text;--> statement-breakpoint
DELETE FROM "notifications" WHERE "type" = 'follow';--> statement-breakpoint
DROP TYPE "public"."notification_type";--> statement-breakpoint
CREATE TYPE "public"."notification_type" AS ENUM('connection', 'like', 'comment', 'reply', 'message', 'task', 'moderation');--> statement-breakpoint
ALTER TABLE "notifications" ALTER COLUMN "type" SET DATA TYPE "public"."notification_type" USING "type"::"public"."notification_type";--> statement-breakpoint
ALTER TABLE "posts" ALTER COLUMN "visibility" SET DATA TYPE text;--> statement-breakpoint
UPDATE "posts" SET "visibility" = 'connections' WHERE "visibility" = 'followers';--> statement-breakpoint
ALTER TABLE "posts" ALTER COLUMN "visibility" SET DEFAULT 'campus'::text;--> statement-breakpoint
DROP TYPE "public"."post_visibility";--> statement-breakpoint
CREATE TYPE "public"."post_visibility" AS ENUM('campus', 'connections', 'public');--> statement-breakpoint
ALTER TABLE "posts" ALTER COLUMN "visibility" SET DEFAULT 'campus'::"public"."post_visibility";--> statement-breakpoint
ALTER TABLE "posts" ALTER COLUMN "visibility" SET DATA TYPE "public"."post_visibility" USING "visibility"::"public"."post_visibility";--> statement-breakpoint
DROP INDEX "follows_following_id_index";--> statement-breakpoint
ALTER TABLE "connection_intents" DROP CONSTRAINT "follows_follower_id_following_id_pk";--> statement-breakpoint
ALTER TABLE "connection_intents" ADD CONSTRAINT "connection_intents_requester_id_recipient_id_pk" PRIMARY KEY("requester_id","recipient_id");--> statement-breakpoint
ALTER TABLE "connection_intents" ADD COLUMN "expires_at" timestamp with time zone DEFAULT (now() + interval '30 days') NOT NULL;--> statement-breakpoint
ALTER TABLE "connection_intents" ALTER COLUMN "expires_at" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "education" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "projects" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "achievements" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "connections" ADD CONSTRAINT "connections_user_one_id_users_id_fk" FOREIGN KEY ("user_one_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connections" ADD CONSTRAINT "connections_user_two_id_users_id_fk" FOREIGN KEY ("user_two_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "connections_user_two_id_index" ON "connections" USING btree ("user_two_id");--> statement-breakpoint
ALTER TABLE "connection_intents" ADD CONSTRAINT "connection_intents_requester_id_users_id_fk" FOREIGN KEY ("requester_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connection_intents" ADD CONSTRAINT "connection_intents_recipient_id_users_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "connection_intents_recipient_index" ON "connection_intents" USING btree ("recipient_id");--> statement-breakpoint
CREATE INDEX "connection_intents_expires_at_index" ON "connection_intents" USING btree ("expires_at");--> statement-breakpoint
ALTER TABLE "connection_intents" ADD CONSTRAINT "connection_intents_cannot_request_self" CHECK ("connection_intents"."requester_id" <> "connection_intents"."recipient_id");--> statement-breakpoint
INSERT INTO "connections" ("user_one_id", "user_two_id")
SELECT DISTINCT
	LEAST(intent."requester_id", intent."recipient_id"),
	GREATEST(intent."requester_id", intent."recipient_id")
FROM "connection_intents" intent
INNER JOIN "connection_intents" reverse_intent
	ON reverse_intent."requester_id" = intent."recipient_id"
	AND reverse_intent."recipient_id" = intent."requester_id"
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "connections" ("user_one_id", "user_two_id")
SELECT DISTINCT
	LEAST(first_participant."user_id", second_participant."user_id"),
	GREATEST(first_participant."user_id", second_participant."user_id")
FROM "chats"
INNER JOIN "chat_participants" first_participant
	ON first_participant."chat_id" = "chats"."id"
	AND first_participant."archived_at" IS NULL
INNER JOIN "chat_participants" second_participant
	ON second_participant."chat_id" = "chats"."id"
	AND second_participant."archived_at" IS NULL
	AND first_participant."user_id" < second_participant."user_id"
WHERE "chats"."type" = 'direct'
ON CONFLICT DO NOTHING;--> statement-breakpoint
DELETE FROM "connection_intents" intent
USING "connections" connection
WHERE (intent."requester_id" = connection."user_one_id" AND intent."recipient_id" = connection."user_two_id")
   OR (intent."requester_id" = connection."user_two_id" AND intent."recipient_id" = connection."user_one_id");
