ALTER TABLE "setups" ADD COLUMN "share_token" text;--> statement-breakpoint
ALTER TABLE "setups" ADD COLUMN "is_shared" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "setups" ADD CONSTRAINT "setups_share_token_unique" UNIQUE("share_token");