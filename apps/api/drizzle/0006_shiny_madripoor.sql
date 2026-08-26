CREATE TYPE "public"."support_request_category" AS ENUM('section_change', 'missing_course', 'enrollment', 'schedule_conflict', 'harassment', 'technical', 'financial', 'wellbeing', 'other');--> statement-breakpoint
CREATE TYPE "public"."support_request_status" AS ENUM('pending', 'reviewing', 'resolved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."support_request_urgency" AS ENUM('low', 'medium', 'high');--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'support_request';--> statement-breakpoint
CREATE TABLE "support_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"requester_id" uuid NOT NULL,
	"assigned_to_id" uuid,
	"source_message_id" uuid,
	"category" "support_request_category" NOT NULL,
	"subject" varchar(160) NOT NULL,
	"description" varchar(2000) NOT NULL,
	"desired_outcome" varchar(1000) NOT NULL,
	"urgency" "support_request_urgency" DEFAULT 'medium' NOT NULL,
	"status" "support_request_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "assistant_messages" ADD COLUMN "action" jsonb;--> statement-breakpoint
ALTER TABLE "support_requests" ADD CONSTRAINT "support_requests_requester_id_users_id_fk" FOREIGN KEY ("requester_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_requests" ADD CONSTRAINT "support_requests_assigned_to_id_users_id_fk" FOREIGN KEY ("assigned_to_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_requests" ADD CONSTRAINT "support_requests_source_message_id_assistant_messages_id_fk" FOREIGN KEY ("source_message_id") REFERENCES "public"."assistant_messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "support_requests_source_message_unique" ON "support_requests" USING btree ("source_message_id");--> statement-breakpoint
CREATE INDEX "support_requests_requester_created_at_index" ON "support_requests" USING btree ("requester_id","created_at");--> statement-breakpoint
CREATE INDEX "support_requests_status_created_at_index" ON "support_requests" USING btree ("status","created_at");