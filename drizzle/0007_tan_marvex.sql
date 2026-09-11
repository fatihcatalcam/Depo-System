ALTER TABLE "orders" ADD COLUMN "manual_total_kurus" bigint;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "invoice_title" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "invoice_tax_office" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "invoice_tax_number" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "invoice_address" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "invoice_no" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "invoice_date" date;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "is_deposit" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_manual_total_chk" CHECK ("orders"."manual_total_kurus" IS NULL OR "orders"."manual_total_kurus" >= 0);