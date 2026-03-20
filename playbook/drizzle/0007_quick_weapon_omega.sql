ALTER TABLE "components" ADD COLUMN "uuid" text;--> statement-breakpoint
UPDATE "components" SET "uuid" = gen_random_uuid()::text WHERE "uuid" IS NULL;--> statement-breakpoint
ALTER TABLE "components" ALTER COLUMN "uuid" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "strategies" ADD COLUMN "is_public" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "strategies" ADD COLUMN "share_token" text;--> statement-breakpoint
ALTER TABLE "strategies" ADD COLUMN "forked_from_id" integer;--> statement-breakpoint
ALTER TABLE "strategies" ADD CONSTRAINT "strategies_forked_from_id_strategies_id_fk" FOREIGN KEY ("forked_from_id") REFERENCES "public"."strategies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "components" ADD CONSTRAINT "components_uuid_unique" UNIQUE("uuid");--> statement-breakpoint
ALTER TABLE "strategies" ADD CONSTRAINT "strategies_share_token_unique" UNIQUE("share_token");