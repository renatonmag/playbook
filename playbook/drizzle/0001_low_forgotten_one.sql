CREATE TABLE "checklist" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "checklist_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"title" varchar(255) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "checklist_to_components" (
	"checklist_id" integer,
	"component_id" integer
);
--> statement-breakpoint
CREATE TABLE "components" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "components_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"title" varchar(255) NOT NULL,
	"markdown_id" integer
);
--> statement-breakpoint
CREATE TABLE "images" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "images_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"uri" text NOT NULL,
	"component_id" integer
);
--> statement-breakpoint
CREATE TABLE "markdown" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "markdown_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"title" varchar(255) NOT NULL,
	"content" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "lastName" varchar(255) NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "username" varchar(255) NOT NULL;--> statement-breakpoint
ALTER TABLE "checklist_to_components" ADD CONSTRAINT "checklist_to_components_checklist_id_checklist_id_fk" FOREIGN KEY ("checklist_id") REFERENCES "public"."checklist"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checklist_to_components" ADD CONSTRAINT "checklist_to_components_component_id_components_id_fk" FOREIGN KEY ("component_id") REFERENCES "public"."components"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "components" ADD CONSTRAINT "components_markdown_id_markdown_id_fk" FOREIGN KEY ("markdown_id") REFERENCES "public"."markdown"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "images" ADD CONSTRAINT "images_component_id_components_id_fk" FOREIGN KEY ("component_id") REFERENCES "public"."components"("id") ON DELETE no action ON UPDATE no action;