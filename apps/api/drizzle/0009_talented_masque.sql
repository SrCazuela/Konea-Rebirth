CREATE TYPE "public"."duco_draft_kind" AS ENUM('task', 'support_request');--> statement-breakpoint
CREATE TYPE "public"."duco_draft_status" AS ENUM('collecting_information', 'ready_for_review', 'confirmed', 'cancelled', 'expired');--> statement-breakpoint
CREATE TABLE "duco_drafts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" "duco_draft_kind" NOT NULL,
	"status" "duco_draft_status" DEFAULT 'collecting_information' NOT NULL,
	"payload" jsonb NOT NULL,
	"source_message_id" uuid,
	"completed_resource_id" uuid,
	"expires_at" timestamp with time zone DEFAULT now() + interval '30 days' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "duco_drafts" ADD CONSTRAINT "duco_drafts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "duco_drafts" ADD CONSTRAINT "duco_drafts_source_message_id_assistant_messages_id_fk" FOREIGN KEY ("source_message_id") REFERENCES "public"."assistant_messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "duco_drafts_source_message_unique" ON "duco_drafts" USING btree ("source_message_id") WHERE "duco_drafts"."source_message_id" is not null;--> statement-breakpoint
CREATE INDEX "duco_drafts_user_status_updated_at_index" ON "duco_drafts" USING btree ("user_id","status","updated_at");--> statement-breakpoint
CREATE INDEX "duco_drafts_expires_at_index" ON "duco_drafts" USING btree ("expires_at");