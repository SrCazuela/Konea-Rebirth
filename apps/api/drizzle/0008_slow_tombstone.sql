CREATE TYPE "public"."academic_course_source" AS ENUM('manual', 'ava');--> statement-breakpoint
CREATE TABLE "academic_courses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" varchar(300) NOT NULL,
	"normalized_name" varchar(300) NOT NULL,
	"code" varchar(80),
	"section" varchar(80),
	"term" varchar(100),
	"source" "academic_course_source" DEFAULT 'manual' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "academic_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"course_id" uuid,
	"title" varchar(160) NOT NULL,
	"description" varchar(1000),
	"due_at" timestamp with time zone,
	"priority" "task_priority" DEFAULT 'medium' NOT NULL,
	"status" "task_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "academic_courses" ADD CONSTRAINT "academic_courses_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "academic_tasks" ADD CONSTRAINT "academic_tasks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "academic_tasks" ADD CONSTRAINT "academic_tasks_course_id_academic_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."academic_courses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "academic_courses_user_name_unique" ON "academic_courses" USING btree ("user_id","normalized_name");--> statement-breakpoint
CREATE INDEX "academic_courses_user_active_index" ON "academic_courses" USING btree ("user_id","active");--> statement-breakpoint
CREATE INDEX "academic_tasks_user_status_due_index" ON "academic_tasks" USING btree ("user_id","status","due_at");--> statement-breakpoint
CREATE INDEX "academic_tasks_course_index" ON "academic_tasks" USING btree ("course_id");