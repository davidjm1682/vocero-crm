CREATE TABLE "agency" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"plan" text NOT NULL,
	"plan_limit" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "agency_id" text;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "archived_at" timestamp;--> statement-breakpoint
ALTER TABLE "organization" ADD CONSTRAINT "organization_agency_id_agency_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agency"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "organization_agency_idx" ON "organization" USING btree ("agency_id","archived_at");