-- Serbest siparis satiri (katalogda olmayan urun) ve ikinci teslimat telefonu.
--
-- Kisit karsilastirmalari `::text` ile yapiliyor, enum degeriyle degil.
-- Postgres yeni eklenen bir enum degerinin ayni transaction icinde
-- kullanilmasina izin vermiyor (check_safe_enum_use); ilk denemede goc tam da
-- bu yuzden reddedildi. PGlite izin veriyordu, Neon vermedi.

ALTER TYPE "public"."order_line_item_type" ADD VALUE 'custom';--> statement-breakpoint
ALTER TABLE "order_lines" DROP CONSTRAINT "order_lines_item_ref_chk";--> statement-breakpoint
ALTER TABLE "order_line_components" ALTER COLUMN "stock_item_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "delivery_phone2" text;--> statement-breakpoint
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_item_ref_chk" CHECK (("order_lines"."item_type"::text = 'product' AND "order_lines"."product_id" IS NOT NULL AND "order_lines"."stock_item_id" IS NULL)
          OR ("order_lines"."item_type"::text = 'stock_item' AND "order_lines"."stock_item_id" IS NOT NULL AND "order_lines"."product_id" IS NULL)
          OR ("order_lines"."item_type"::text = 'custom' AND "order_lines"."product_id" IS NULL AND "order_lines"."stock_item_id" IS NULL));