CREATE TABLE "academic_calendar_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"external_id" varchar(64) NOT NULL,
	"uid" varchar(500),
	"title" varchar(300) NOT NULL,
	"description" text,
	"location" varchar(300),
	"course_name" varchar(300),
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone,
	"all_day" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"last_synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "academic_calendar_syncs" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"last_synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_event_count" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "academic_calendar_events" ADD CONSTRAINT "academic_calendar_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "academic_calendar_syncs" ADD CONSTRAINT "academic_calendar_syncs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "academic_calendar_events_user_external_unique" ON "academic_calendar_events" USING btree ("user_id","external_id");--> statement-breakpoint
CREATE INDEX "academic_calendar_events_user_start_index" ON "academic_calendar_events" USING btree ("user_id","starts_at");