CREATE TABLE "update_jobs" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"from_version" varchar(32) NOT NULL,
	"to_version" varchar(32) NOT NULL,
	"tag" varchar(64) NOT NULL,
	"commit" varchar(40) NOT NULL,
	"adapter" varchar(32) NOT NULL,
	"status" varchar(16) DEFAULT 'queued' NOT NULL,
	"external_id" varchar(128),
	"external_url" text,
	"detail" text,
	"migrations" jsonb,
	"started_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "update_jobs" ADD CONSTRAINT "update_jobs_started_by_cms_user_id_fk" FOREIGN KEY ("started_by") REFERENCES "public"."cms_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "update_jobs_created_at_idx" ON "update_jobs" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "update_jobs_single_active_idx" ON "update_jobs" USING btree (((true))) WHERE "update_jobs"."status" in ('queued', 'deploying');--> statement-breakpoint
-- Role JSON predates update_core on existing installations. Append it to
-- administrator only; custom roles keep their explicit capabilities.
UPDATE "cms_options"
SET "value" = jsonb_set("value", '{administrator}', jsonb_set(
  "value" -> 'administrator',
  '{capabilities}',
  (("value" #> '{administrator,capabilities}') || '["update_core"]'::jsonb)
))
WHERE "name" = 'core:roles'
  AND "value" #> '{administrator,capabilities}' IS NOT NULL
  AND NOT ("value" #> '{administrator,capabilities}') @> '["update_core"]'::jsonb;
