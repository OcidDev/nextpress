CREATE TABLE "cms_account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cms_admin_preferences" (
	"user_id" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "authors" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"user_id" text,
	"slug" varchar(160) NOT NULL,
	"name" varchar(160) NOT NULL,
	"avatar" text,
	"bio" text,
	"role" varchar(80),
	"social" jsonb,
	"verified" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"slug" varchar(160) NOT NULL,
	"name" varchar(160) NOT NULL,
	"description" text,
	"parent_id" varchar(32),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "categories_parent_not_self_check" CHECK ("categories"."parent_id" is null or "categories"."parent_id" <> "categories"."id")
);
--> statement-breakpoint
CREATE TABLE "cms_comment_limits" (
	"key" text PRIMARY KEY NOT NULL,
	"count" integer NOT NULL,
	"reset_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cms_comment_meta" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"object_id" varchar(32) NOT NULL,
	"meta_key" varchar(191) NOT NULL,
	"meta_value" jsonb NOT NULL,
	CONSTRAINT "cms_comment_meta_key_check" CHECK (length("cms_comment_meta"."meta_key") > 0),
	CONSTRAINT "cms_comment_meta_value_size_check" CHECK (octet_length("cms_comment_meta"."meta_value"::text) <= 65536)
);
--> statement-breakpoint
CREATE TABLE "comments" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"post_id" varchar(32) NOT NULL,
	"parent_id" varchar(32),
	"author_name" varchar(120) NOT NULL,
	"author_email" varchar(200) NOT NULL,
	"author_website" text,
	"content" text NOT NULL,
	"status" varchar(16) DEFAULT 'pending' NOT NULL,
	"ip_hash" varchar(64),
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cms_content" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"type" varchar(20) NOT NULL,
	"status" varchar(20) DEFAULT 'draft' NOT NULL,
	"parent_id" varchar(32),
	"author_id" text,
	"legacy_author_id" varchar(32),
	"slug" varchar(200) DEFAULT '' NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"format" varchar(16) DEFAULT 'html' NOT NULL,
	"excerpt" text DEFAULT '' NOT NULL,
	"visibility" varchar(16) DEFAULT 'public' NOT NULL,
	"password_hash" text,
	"comment_status" varchar(16) DEFAULT 'open' NOT NULL,
	"mime_type" varchar(120),
	"menu_order" integer DEFAULT 0 NOT NULL,
	"guid" text,
	"revision" integer DEFAULT 1 NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"modified_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cms_content_revision_check" CHECK ("cms_content"."revision" >= 1),
	CONSTRAINT "cms_content_format_check" CHECK ("cms_content"."format" in ('html', 'blocks')),
	CONSTRAINT "cms_content_visibility_check" CHECK ("cms_content"."visibility" in ('public', 'private', 'password')),
	CONSTRAINT "cms_content_comment_status_check" CHECK ("cms_content"."comment_status" in ('open', 'closed')),
	CONSTRAINT "cms_content_parent_check" CHECK ("cms_content"."parent_id" is null or "cms_content"."parent_id" <> "cms_content"."id"),
	CONSTRAINT "cms_content_password_check" CHECK ("cms_content"."visibility" <> 'password' or "cms_content"."password_hash" is not null)
);
--> statement-breakpoint
CREATE TABLE "cms_content_meta" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"object_id" varchar(32) NOT NULL,
	"meta_key" varchar(191) NOT NULL,
	"meta_value" jsonb NOT NULL,
	CONSTRAINT "cms_content_meta_key_check" CHECK (length("cms_content_meta"."meta_key") > 0),
	CONSTRAINT "cms_content_meta_value_size_check" CHECK (octet_length("cms_content_meta"."meta_value"::text) <= 65536)
);
--> statement-breakpoint
CREATE TABLE "cms_legacy_content_map" (
	"source" varchar(16) NOT NULL,
	"source_id" text NOT NULL,
	"content_id" varchar(32) NOT NULL,
	"source_hash" varchar(64) NOT NULL,
	"target_hash" varchar(64) NOT NULL,
	"migrated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cms_legacy_content_map_source_source_id_pk" PRIMARY KEY("source","source_id"),
	CONSTRAINT "cms_legacy_content_map_source_check" CHECK ("cms_legacy_content_map"."source" in ('post','page','media'))
);
--> statement-breakpoint
CREATE TABLE "cms_media" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"mime_type" text NOT NULL,
	"size" integer NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"alt" text DEFAULT '' NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"caption" text DEFAULT '' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"data" "bytea" NOT NULL,
	"uploaded_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cms_options" (
	"name" varchar(191) PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"autoload" boolean DEFAULT false NOT NULL,
	"legacy" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cms_options_name_check" CHECK ("cms_options"."name" ~ '^[a-zA-Z0-9_.:-]+$'),
	CONSTRAINT "cms_options_size_check" CHECK (octet_length("cms_options"."value"::text) <= 1048576),
	CONSTRAINT "cms_options_autoload_size_check" CHECK (not "cms_options"."autoload" or octet_length("cms_options"."value"::text) <= 65536)
);
--> statement-breakpoint
CREATE TABLE "pages" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"slug" varchar(200) NOT NULL,
	"title" text NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"parent_id" varchar(32),
	"menu_order" integer DEFAULT 0 NOT NULL,
	"page_template" varchar(200) DEFAULT 'default' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pages_parent_not_self" CHECK ("pages"."parent_id" is null or "pages"."parent_id" <> "pages"."id")
);
--> statement-breakpoint
CREATE TABLE "post_categories" (
	"post_id" varchar(32) NOT NULL,
	"category_id" varchar(32) NOT NULL,
	CONSTRAINT "post_categories_post_id_category_id_pk" PRIMARY KEY("post_id","category_id")
);
--> statement-breakpoint
CREATE TABLE "post_tags" (
	"post_id" varchar(32) NOT NULL,
	"tag" varchar(120) NOT NULL,
	CONSTRAINT "post_tags_post_id_tag_pk" PRIMARY KEY("post_id","tag")
);
--> statement-breakpoint
CREATE TABLE "posts" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"slug" varchar(200) NOT NULL,
	"title" text NOT NULL,
	"excerpt" text DEFAULT '' NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"featured_image" text,
	"featured_image_alt" text,
	"is_youtube" boolean DEFAULT false NOT NULL,
	"author_id" varchar(32) NOT NULL,
	"is_sponsored" boolean DEFAULT false NOT NULL,
	"is_product" boolean DEFAULT false NOT NULL,
	"layout" varchar(16) DEFAULT 'default' NOT NULL,
	"allow_comments" boolean DEFAULT true NOT NULL,
	"show_ads" boolean DEFAULT true NOT NULL,
	"reading_time" integer DEFAULT 0 NOT NULL,
	"word_count" integer DEFAULT 0 NOT NULL,
	"view_count" integer DEFAULT 0 NOT NULL,
	"comment_count" integer DEFAULT 0 NOT NULL,
	"status" varchar(16) DEFAULT 'draft' NOT NULL,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	"legacy_path" text,
	"search_vector" "tsvector" GENERATED ALWAYS AS (setweight(to_tsvector('simple', coalesce(title, '')), 'A') || setweight(to_tsvector('simple', coalesce(excerpt, '')), 'B')) STORED
);
--> statement-breakpoint
CREATE TABLE "cms_rate_limit" (
	"id" text PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"count" integer NOT NULL,
	"last_request" bigint NOT NULL,
	CONSTRAINT "cms_rate_limit_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "cms_session" (
	"id" text PRIMARY KEY NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"user_id" text NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cms_session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "cms_settings" (
	"id" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cms_term_meta" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"object_id" varchar(32) NOT NULL,
	"meta_key" varchar(191) NOT NULL,
	"meta_value" jsonb NOT NULL,
	CONSTRAINT "cms_term_meta_key_check" CHECK (length("cms_term_meta"."meta_key") > 0),
	CONSTRAINT "cms_term_meta_value_size_check" CHECK (octet_length("cms_term_meta"."meta_value"::text) <= 65536)
);
--> statement-breakpoint
CREATE TABLE "cms_term_relationships" (
	"content_id" varchar(32) NOT NULL,
	"term_taxonomy_id" varchar(32) NOT NULL,
	"term_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "cms_term_relationships_content_id_term_taxonomy_id_pk" PRIMARY KEY("content_id","term_taxonomy_id"),
	CONSTRAINT "cms_term_relationships_order_check" CHECK ("cms_term_relationships"."term_order" >= 0)
);
--> statement-breakpoint
CREATE TABLE "cms_term_taxonomy" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"term_id" varchar(32) NOT NULL,
	"taxonomy" varchar(32) NOT NULL,
	"parent_id" varchar(32),
	"description" text DEFAULT '' NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "cms_term_taxonomy_count_check" CHECK ("cms_term_taxonomy"."count" >= 0),
	CONSTRAINT "cms_term_taxonomy_parent_check" CHECK ("cms_term_taxonomy"."parent_id" is null or "cms_term_taxonomy"."parent_id" <> "cms_term_taxonomy"."id")
);
--> statement-breakpoint
CREATE TABLE "cms_terms" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"name" varchar(160) NOT NULL,
	"slug" varchar(200) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cms_transients" (
	"name" varchar(191) PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "cms_transients_size_check" CHECK (octet_length("cms_transients"."value"::text) <= 1048576)
);
--> statement-breakpoint
CREATE TABLE "cms_user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"role" text DEFAULT 'author' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cms_user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "cms_user_meta" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"object_id" text NOT NULL,
	"meta_key" varchar(191) NOT NULL,
	"meta_value" jsonb NOT NULL,
	CONSTRAINT "cms_user_meta_key_check" CHECK (length("cms_user_meta"."meta_key") > 0),
	CONSTRAINT "cms_user_meta_value_size_check" CHECK (octet_length("cms_user_meta"."meta_value"::text) <= 65536)
);
--> statement-breakpoint
CREATE TABLE "cms_verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cms_view_batches" (
	"batch_id" varchar(32) NOT NULL,
	"day" date NOT NULL,
	"metric" varchar(40) NOT NULL,
	"count" bigint NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cms_view_batches_batch_id_metric_pk" PRIMARY KEY("batch_id","metric")
);
--> statement-breakpoint
CREATE TABLE "cms_view_daily" (
	"day" date NOT NULL,
	"metric" varchar(40) NOT NULL,
	"count" bigint DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cms_view_daily_day_metric_pk" PRIMARY KEY("day","metric")
);
--> statement-breakpoint
ALTER TABLE "cms_account" ADD CONSTRAINT "cms_account_user_id_cms_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."cms_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_admin_preferences" ADD CONSTRAINT "cms_admin_preferences_user_id_cms_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."cms_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "authors" ADD CONSTRAINT "authors_user_id_cms_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."cms_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_parent_id_categories_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_comment_meta" ADD CONSTRAINT "cms_comment_meta_object_id_comments_id_fk" FOREIGN KEY ("object_id") REFERENCES "public"."comments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_parent_id_comments_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."comments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_content" ADD CONSTRAINT "cms_content_parent_id_cms_content_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."cms_content"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_content" ADD CONSTRAINT "cms_content_author_id_cms_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."cms_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_content_meta" ADD CONSTRAINT "cms_content_meta_object_id_cms_content_id_fk" FOREIGN KEY ("object_id") REFERENCES "public"."cms_content"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_legacy_content_map" ADD CONSTRAINT "cms_legacy_content_map_content_id_cms_content_id_fk" FOREIGN KEY ("content_id") REFERENCES "public"."cms_content"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_media" ADD CONSTRAINT "cms_media_uploaded_by_cms_user_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."cms_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pages" ADD CONSTRAINT "pages_parent_id_pages_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."pages"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_categories" ADD CONSTRAINT "post_categories_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_categories" ADD CONSTRAINT "post_categories_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_tags" ADD CONSTRAINT "post_tags_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_author_id_authors_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."authors"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_session" ADD CONSTRAINT "cms_session_user_id_cms_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."cms_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_term_meta" ADD CONSTRAINT "cms_term_meta_object_id_cms_terms_id_fk" FOREIGN KEY ("object_id") REFERENCES "public"."cms_terms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_term_relationships" ADD CONSTRAINT "cms_term_relationships_content_id_cms_content_id_fk" FOREIGN KEY ("content_id") REFERENCES "public"."cms_content"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_term_relationships" ADD CONSTRAINT "cms_term_relationships_term_taxonomy_id_cms_term_taxonomy_id_fk" FOREIGN KEY ("term_taxonomy_id") REFERENCES "public"."cms_term_taxonomy"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_term_taxonomy" ADD CONSTRAINT "cms_term_taxonomy_term_id_cms_terms_id_fk" FOREIGN KEY ("term_id") REFERENCES "public"."cms_terms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_term_taxonomy" ADD CONSTRAINT "cms_term_taxonomy_parent_id_cms_term_taxonomy_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."cms_term_taxonomy"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_user_meta" ADD CONSTRAINT "cms_user_meta_object_id_cms_user_id_fk" FOREIGN KEY ("object_id") REFERENCES "public"."cms_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cms_account_user_idx" ON "cms_account" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "authors_slug_idx" ON "authors" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "authors_user_idx" ON "authors" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "categories_slug_idx" ON "categories" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "categories_parent_idx" ON "categories" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "cms_comment_meta_object_key_idx" ON "cms_comment_meta" USING btree ("object_id","meta_key");--> statement-breakpoint
CREATE INDEX "comments_post_status_idx" ON "comments" USING btree ("post_id","status","created_at");--> statement-breakpoint
CREATE INDEX "comments_parent_idx" ON "comments" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "cms_content_type_status_date_idx" ON "cms_content" USING btree ("type","status","published_at" DESC NULLS LAST,"id");--> statement-breakpoint
CREATE INDEX "cms_content_parent_idx" ON "cms_content" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "cms_content_author_idx" ON "cms_content" USING btree ("author_id");--> statement-breakpoint
CREATE INDEX "cms_content_slug_idx" ON "cms_content" USING btree ("type","slug");--> statement-breakpoint
CREATE INDEX "cms_content_meta_object_key_idx" ON "cms_content_meta" USING btree ("object_id","meta_key");--> statement-breakpoint
CREATE UNIQUE INDEX "cms_legacy_content_map_target_idx" ON "cms_legacy_content_map" USING btree ("content_id");--> statement-breakpoint
CREATE INDEX "cms_options_autoload_idx" ON "cms_options" USING btree ("name") WHERE "cms_options"."autoload" = true;--> statement-breakpoint
CREATE UNIQUE INDEX "pages_slug_idx" ON "pages" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "pages_parent_order_idx" ON "pages" USING btree ("parent_id","menu_order");--> statement-breakpoint
CREATE INDEX "post_categories_category_idx" ON "post_categories" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "post_tags_tag_idx" ON "post_tags" USING btree ("tag");--> statement-breakpoint
CREATE UNIQUE INDEX "posts_slug_idx" ON "posts" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "posts_status_published_idx" ON "posts" USING btree ("status","published_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "posts_views_idx" ON "posts" USING btree ("view_count" DESC NULLS LAST) WHERE status = 'published';--> statement-breakpoint
CREATE INDEX "posts_search_idx" ON "posts" USING gin ("search_vector");--> statement-breakpoint
CREATE INDEX "posts_legacy_path_idx" ON "posts" USING btree ("legacy_path");--> statement-breakpoint
CREATE INDEX "cms_session_user_idx" ON "cms_session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "cms_term_meta_object_key_idx" ON "cms_term_meta" USING btree ("object_id","meta_key");--> statement-breakpoint
CREATE INDEX "cms_term_relationships_term_idx" ON "cms_term_relationships" USING btree ("term_taxonomy_id");--> statement-breakpoint
CREATE UNIQUE INDEX "cms_term_taxonomy_term_name_idx" ON "cms_term_taxonomy" USING btree ("term_id","taxonomy");--> statement-breakpoint
CREATE INDEX "cms_term_taxonomy_name_idx" ON "cms_term_taxonomy" USING btree ("taxonomy");--> statement-breakpoint
CREATE INDEX "cms_term_taxonomy_parent_idx" ON "cms_term_taxonomy" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "cms_terms_slug_idx" ON "cms_terms" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "cms_transients_expiry_idx" ON "cms_transients" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "cms_user_meta_object_key_idx" ON "cms_user_meta" USING btree ("object_id","meta_key");--> statement-breakpoint
CREATE INDEX "cms_verification_identifier_idx" ON "cms_verification" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX "cms_view_daily_metric_day_idx" ON "cms_view_daily" USING btree ("metric","day");
--> statement-breakpoint
-- Opsi inti adalah sumber kebenaran; `cms_settings` tetap ada sebagai proyeksi
-- agar pembaca lama dan rollback melihat nilai yang sama di transaksi yang sama.
CREATE FUNCTION cms_options_to_settings() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_catalog AS $$
BEGIN
  IF pg_trigger_depth() > 1 THEN RETURN NULL; END IF;
  IF TG_OP = 'DELETE' THEN
    IF OLD.legacy THEN DELETE FROM cms_settings WHERE id = OLD.name; END IF;
  ELSE
    IF TG_OP = 'UPDATE' AND OLD.legacy AND (OLD.name <> NEW.name OR NOT NEW.legacy) THEN
      DELETE FROM cms_settings WHERE id = OLD.name;
    END IF;
    IF NEW.legacy THEN
      INSERT INTO cms_settings(id, value, updated_at) VALUES (NEW.name, NEW.value, NEW.updated_at)
      ON CONFLICT (id) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at;
    END IF;
  END IF;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE FUNCTION cms_settings_to_options() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_catalog AS $$
BEGIN
  IF pg_trigger_depth() > 1 THEN RETURN NULL; END IF;
  IF TG_OP = 'DELETE' THEN
    DELETE FROM cms_options WHERE name = OLD.id AND legacy;
  ELSE
    IF TG_OP = 'UPDATE' AND OLD.id <> NEW.id THEN
      DELETE FROM cms_options WHERE name = OLD.id AND legacy;
    END IF;
    INSERT INTO cms_options(name, value, autoload, legacy, updated_at)
    VALUES (NEW.id, NEW.value, NEW.id = 'site' AND octet_length(NEW.value::text) <= 65536, true, NEW.updated_at)
    ON CONFLICT (name) DO UPDATE SET value = excluded.value, legacy = true,
      autoload = excluded.autoload, updated_at = excluded.updated_at;
  END IF;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER cms_options_projection AFTER INSERT OR UPDATE OR DELETE ON cms_options
FOR EACH ROW EXECUTE FUNCTION cms_options_to_settings();
--> statement-breakpoint
CREATE TRIGGER cms_settings_compatibility AFTER INSERT OR UPDATE OR DELETE ON cms_settings
FOR EACH ROW EXECUTE FUNCTION cms_settings_to_options();
--> statement-breakpoint
CREATE FUNCTION cms_settings_truncated() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_catalog AS $$
BEGIN
  DELETE FROM cms_options WHERE legacy;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER cms_settings_truncate AFTER TRUNCATE ON cms_settings
FOR EACH STATEMENT EXECUTE FUNCTION cms_settings_truncated();
--> statement-breakpoint
CREATE FUNCTION cms_options_truncated() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_catalog AS $$
BEGIN
  DELETE FROM cms_settings;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER cms_options_truncate AFTER TRUNCATE ON cms_options
FOR EACH STATEMENT EXECUTE FUNCTION cms_options_truncated();

--> statement-breakpoint
-- Peran awal direkam sebagai opsi agar panel pengguna menampilkan susunan yang
-- sama dengan `initialRoles()` di kode sebelum ada penyuntingan.
INSERT INTO cms_options(name,value,autoload) VALUES ('core:roles', '{"administrator":{"label":"Administrator","capabilities":["read","edit_profile","edit_posts","edit_others_posts","edit_published_posts","publish_posts","delete_posts","delete_others_posts","delete_published_posts","read_private_posts","edit_pages","edit_others_pages","edit_published_pages","publish_pages","delete_pages","delete_others_pages","delete_published_pages","read_private_pages","upload_files","manage_categories","moderate_comments","manage_options","list_users","edit_users"]},"editor":{"label":"Editor","capabilities":["read","edit_profile","edit_posts","edit_others_posts","edit_published_posts","publish_posts","delete_posts","delete_others_posts","delete_published_posts","read_private_posts","edit_pages","edit_others_pages","edit_published_pages","publish_pages","delete_pages","delete_others_pages","delete_published_pages","read_private_pages","upload_files","manage_categories","moderate_comments"]},"author":{"label":"Penulis","capabilities":["read","edit_profile","edit_posts","edit_published_posts","publish_posts","delete_posts","delete_published_posts","upload_files"]},"contributor":{"label":"Kontributor","capabilities":["read","edit_profile","edit_posts","delete_posts"]},"subscriber":{"label":"Pelanggan","capabilities":["read","edit_profile"]}}'::jsonb, true) ON CONFLICT(name) DO NOTHING;
--> statement-breakpoint
-- Kategori baku. Idempoten terhadap slug agar instalasi yang sudah memilikinya
-- tidak diubah nama maupun deskripsinya.
INSERT INTO "categories" ("id", "slug", "name", "description")
VALUES ('c0de7a0000000000000000756e636174', 'uncategorized', 'Tanpa Kategori', 'Kategori bawaan untuk artikel.')
ON CONFLICT ("slug") DO NOTHING;
