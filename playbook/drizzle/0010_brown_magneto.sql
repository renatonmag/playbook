CREATE TABLE "setups" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "setups_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" integer NOT NULL,
	"setups" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
DROP TABLE "trades" CASCADE;
ALTER TABLE "setups" ADD CONSTRAINT "setups_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;