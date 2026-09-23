CREATE TYPE "public"."study_method" AS ENUM('pomodoro', 'pomodoro_extended', 'deep_work', 'flowtime', 'custom');--> statement-breakpoint
CREATE TYPE "public"."study_session_event_type" AS ENUM('start', 'pause', 'resume', 'complete', 'cancel');--> statement-breakpoint
CREATE TYPE "public"."study_session_status" AS ENUM('active', 'paused', 'completed', 'cancelled');--> statement-breakpoint
CREATE TABLE "study_session_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"type" "study_session_event_type" NOT NULL,
	"focused_seconds" integer NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "study_session_events_focused_seconds_check" CHECK ("study_session_events"."focused_seconds" >= 0)
);
--> statement-breakpoint
CREATE TABLE "study_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"course_id" uuid,
	"task_id" uuid,
	"client_request_id" uuid NOT NULL,
	"method" "study_method" NOT NULL,
	"status" "study_session_status" DEFAULT 'active' NOT NULL,
	"planned_duration_seconds" integer NOT NULL,
	"break_duration_seconds" integer DEFAULT 0 NOT NULL,
	"focused_seconds" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"active_started_at" timestamp with time zone DEFAULT now(),
	"last_heartbeat_at" timestamp with time zone DEFAULT now() NOT NULL,
	"paused_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "study_sessions_planned_duration_check" CHECK (("study_sessions"."method" = 'flowtime' and "study_sessions"."planned_duration_seconds" = 0) or ("study_sessions"."method" <> 'flowtime' and "study_sessions"."planned_duration_seconds" between 60 and 43200)),
	CONSTRAINT "study_sessions_break_duration_check" CHECK ("study_sessions"."break_duration_seconds" between 0 and 7200),
	CONSTRAINT "study_sessions_focused_seconds_check" CHECK ("study_sessions"."focused_seconds" >= 0),
	CONSTRAINT "study_sessions_state_timestamps_check" CHECK (("study_sessions"."status" = 'active' and "study_sessions"."active_started_at" is not null and "study_sessions"."paused_at" is null and "study_sessions"."ended_at" is null) or ("study_sessions"."status" = 'paused' and "study_sessions"."active_started_at" is null and "study_sessions"."paused_at" is not null and "study_sessions"."ended_at" is null) or ("study_sessions"."status" in ('completed', 'cancelled') and "study_sessions"."active_started_at" is null and "study_sessions"."paused_at" is null and "study_sessions"."ended_at" is not null))
);
--> statement-breakpoint
ALTER TABLE "study_session_events" ADD CONSTRAINT "study_session_events_session_id_study_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."study_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_session_events" ADD CONSTRAINT "study_session_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_sessions" ADD CONSTRAINT "study_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_sessions" ADD CONSTRAINT "study_sessions_course_id_academic_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."academic_courses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_sessions" ADD CONSTRAINT "study_sessions_task_id_academic_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."academic_tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "study_session_events_session_occurred_at_index" ON "study_session_events" USING btree ("session_id","occurred_at");--> statement-breakpoint
CREATE INDEX "study_session_events_user_occurred_at_index" ON "study_session_events" USING btree ("user_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "study_sessions_user_client_request_unique" ON "study_sessions" USING btree ("user_id","client_request_id");--> statement-breakpoint
CREATE UNIQUE INDEX "study_sessions_one_current_per_user_unique" ON "study_sessions" USING btree ("user_id") WHERE "study_sessions"."status" in ('active', 'paused');--> statement-breakpoint
CREATE INDEX "study_sessions_user_started_at_index" ON "study_sessions" USING btree ("user_id","started_at");--> statement-breakpoint
CREATE INDEX "study_sessions_course_started_at_index" ON "study_sessions" USING btree ("course_id","started_at");