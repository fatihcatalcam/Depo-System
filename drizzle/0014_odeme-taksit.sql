ALTER TYPE "public"."payment_method" ADD VALUE 'kart_portal';--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "installments" smallint;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_installments_chk" CHECK ("payments"."installments" IS NULL OR ("payments"."installments" BETWEEN 2 AND 9 AND "payments"."method"::text IN ('kart', 'kart_portal')));