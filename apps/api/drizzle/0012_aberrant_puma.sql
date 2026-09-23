CREATE TYPE "public"."ava_dom_import_status" AS ENUM('draft', 'confirmed', 'discarded');--> statement-breakpoint
ALTER TYPE "public"."academic_course_source" ADD VALUE 'ava_extension';--> statement-breakpoint
CREATE TABLE "ava_dom_imports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"payload_digest" varchar(64) NOT NULL,
	"payload" jsonb NOT NULL,
	"status" "ava_dom_import_status" DEFAULT 'draft' NOT NULL,
	"result" jsonb,
	"expires_at" timestamp with time zone NOT NULL,
	"confirmed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "academic_tasks" ADD COLUMN "external_source" varchar(32);--> statement-breakpoint
ALTER TABLE "academic_tasks" ADD COLUMN "external_id" varchar(64);--> statement-breakpoint
ALTER TABLE "ava_dom_imports" ADD CONSTRAINT "ava_dom_imports_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ava_dom_imports_user_digest_unique" ON "ava_dom_imports" USING btree ("user_id","payload_digest");--> statement-breakpoint
CREATE INDEX "ava_dom_imports_user_created_index" ON "ava_dom_imports" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "ava_dom_imports_expiry_index" ON "ava_dom_imports" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "academic_tasks_user_external_unique" ON "academic_tasks" USING btree ("user_id","external_source","external_id") WHERE "academic_tasks"."external_source" is not null and "academic_tasks"."external_id" is not null;