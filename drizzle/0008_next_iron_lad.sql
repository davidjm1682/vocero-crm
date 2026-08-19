CREATE TABLE "meta_ads_credentials" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"dataset_id" text NOT NULL,
	"token_cipher" text NOT NULL,
	"token_iv" text NOT NULL,
	"token_tag" text NOT NULL,
	"status" text DEFAULT 'connected' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "contact" ADD COLUMN "ad_source_id" text;--> statement-breakpoint
ALTER TABLE "contact" ADD COLUMN "ad_source_type" text;--> statement-breakpoint
ALTER TABLE "contact" ADD COLUMN "ad_source_url" text;--> statement-breakpoint
ALTER TABLE "contact" ADD COLUMN "ad_headline" text;--> statement-breakpoint
ALTER TABLE "contact" ADD COLUMN "ad_body" text;--> statement-breakpoint
ALTER TABLE "contact" ADD COLUMN "ad_ctwa_clid" text;--> statement-breakpoint
ALTER TABLE "pipeline_stage" ADD COLUMN "reports_to_meta_ads" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "meta_ads_credentials" ADD CONSTRAINT "meta_ads_credentials_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "meta_ads_credentials_org_uq" ON "meta_ads_credentials" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "contact_org_ad_source_idx" ON "contact" USING btree ("organization_id","ad_source_id");