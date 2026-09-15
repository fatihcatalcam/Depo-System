CREATE TABLE "salespeople" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "salespeople_name_unique" UNIQUE("name")
);
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "salesperson_id" uuid;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_salesperson_id_salespeople_id_fk" FOREIGN KEY ("salesperson_id") REFERENCES "public"."salespeople"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "orders_salesperson_date_idx" ON "orders" USING btree ("salesperson_id","order_date");--> statement-breakpoint

-- Ilk satici listesi. Isimler musterinin verdigi haliyle, Turkce harfleriyle.
INSERT INTO "salespeople" ("name") VALUES
	('ASYA AHMEDOVA'),
	('MEHTAP DALBUDAK'),
	('ONUR YALÇINKAYA'),
	('BATUHAN YALÇINKAYA');
