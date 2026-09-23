CREATE TYPE "public"."support_request_event_type" AS ENUM('created', 'status_changed', 'response');--> statement-breakpoint
CREATE TABLE "support_request_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"actor_id" uuid,
	"type" "support_request_event_type" NOT NULL,
	"from_status" "support_request_status",
	"to_status" "support_request_status" NOT NULL,
	"note" varchar(1000),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "support_request_events_shape_check" CHECK (("support_request_events"."type" = 'created' and "support_request_events"."from_status" is null) or ("support_request_events"."type" = 'status_changed' and "support_request_events"."from_status" is not null and "support_request_events"."from_status" <> "support_request_events"."to_status") or ("support_request_events"."type" = 'response' and "support_request_events"."from_status" is null and "support_request_events"."note" is not null)),
	CONSTRAINT "support_request_events_note_length_check" CHECK ("support_request_events"."note" is null or char_length(btrim("support_request_events"."note")) between 3 and 1000)
);
--> statement-breakpoint
ALTER TABLE "support_request_events" ADD CONSTRAINT "support_request_events_request_id_support_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."support_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_request_events" ADD CONSTRAINT "support_request_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
INSERT INTO "support_request_events" ("request_id", "actor_id", "type", "from_status", "to_status", "created_at")
SELECT "id", "requester_id", 'created', NULL, "status", "created_at"
FROM "support_requests";--> statement-breakpoint
CREATE INDEX "support_request_events_request_created_at_index" ON "support_request_events" USING btree ("request_id","created_at");--> statement-breakpoint
CREATE INDEX "support_request_events_actor_created_at_index" ON "support_request_events" USING btree ("actor_id","created_at");
