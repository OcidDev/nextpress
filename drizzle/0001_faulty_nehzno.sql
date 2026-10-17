CREATE TABLE "cms_editor_revisions" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"kind" varchar(8) NOT NULL,
	"content_id" varchar(32) NOT NULL,
	"author_id" text,
	"snapshot" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cms_editor_revisions_kind_check" CHECK ("cms_editor_revisions"."kind" in ('posts', 'pages'))
);
--> statement-breakpoint
ALTER TABLE "pages" ADD COLUMN "status" varchar(16) DEFAULT 'published' NOT NULL;--> statement-breakpoint
ALTER TABLE "cms_editor_revisions" ADD CONSTRAINT "cms_editor_revisions_author_id_cms_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."cms_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cms_editor_revisions_content_idx" ON "cms_editor_revisions" USING btree ("kind","content_id","created_at");--> statement-breakpoint
CREATE INDEX "pages_status_idx" ON "pages" USING btree ("status");--> statement-breakpoint
ALTER TABLE "pages" ADD CONSTRAINT "pages_status_check" CHECK ("pages"."status" in ('draft', 'published', 'trash'));