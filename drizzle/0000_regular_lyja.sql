CREATE TABLE "adoption" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bench_id" uuid NOT NULL,
	"donor_id" uuid NOT NULL,
	"public_name" text,
	"starts_on" date NOT NULL,
	"ends_on" date NOT NULL,
	"cancelled_on" date,
	"source" text NOT NULL,
	"request_id" uuid,
	"request_hash" text,
	"external_id" text,
	"import_hash" text,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "adoption_request_id_unique" UNIQUE("request_id"),
	CONSTRAINT "adoption_external_id_unique" UNIQUE("external_id"),
	CONSTRAINT "adoption_positive_period" CHECK ("adoption"."ends_on" > "adoption"."starts_on"),
	CONSTRAINT "adoption_valid_cancellation" CHECK ("adoption"."cancelled_on" IS NULL OR "adoption"."cancelled_on" >= "adoption"."starts_on")
);
--> statement-breakpoint
CREATE TABLE "audit_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"action" text NOT NULL,
	"actor_id" text,
	"origin" text NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bench" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"description" text NOT NULL,
	"latitude" double precision NOT NULL,
	"longitude" double precision NOT NULL,
	"state" text DEFAULT 'in_service' NOT NULL,
	"source" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bench_code_unique" UNIQUE("code"),
	CONSTRAINT "bench_latitude" CHECK ("bench"."latitude" BETWEEN -90 AND 90),
	CONSTRAINT "bench_longitude" CHECK ("bench"."longitude" BETWEEN -180 AND 180),
	CONSTRAINT "bench_state" CHECK ("bench"."state" IN ('in_service', 'unavailable', 'retired'))
);
--> statement-breakpoint
CREATE TABLE "donor" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "donor_email_unique" UNIQUE("email"),
	CONSTRAINT "normalized_email" CHECK ("donor"."email" = lower(btrim("donor"."email")))
);
--> statement-breakpoint
CREATE TABLE "import_batch" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fingerprint" text NOT NULL,
	"kind" text NOT NULL,
	"actor_id" text NOT NULL,
	"result" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "submission_limit" (
	"key" text PRIMARY KEY NOT NULL,
	"count" integer NOT NULL,
	"resets_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "staff_user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "staff_user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "adoption" ADD CONSTRAINT "adoption_bench_id_bench_id_fk" FOREIGN KEY ("bench_id") REFERENCES "public"."bench"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adoption" ADD CONSTRAINT "adoption_donor_id_donor_id_fk" FOREIGN KEY ("donor_id") REFERENCES "public"."donor"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_event" ADD CONSTRAINT "audit_event_actor_id_staff_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."staff_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_batch" ADD CONSTRAINT "import_batch_actor_id_staff_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."staff_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "adoption_bench_idx" ON "adoption" USING btree ("bench_id");--> statement-breakpoint
CREATE INDEX "adoption_donor_idx" ON "adoption" USING btree ("donor_id");--> statement-breakpoint
CREATE INDEX "adoption_ends_idx" ON "adoption" USING btree ("ends_on");--> statement-breakpoint
CREATE INDEX "audit_entity_idx" ON "audit_event" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "import_request_idx" ON "import_batch" USING btree ("fingerprint","actor_id");
