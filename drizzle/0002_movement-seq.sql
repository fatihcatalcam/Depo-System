DROP INDEX "stock_movements_item_idx";--> statement-breakpoint
ALTER TABLE "stock_movements" ADD COLUMN "seq" bigserial NOT NULL;--> statement-breakpoint
CREATE INDEX "stock_movements_item_idx" ON "stock_movements" USING btree ("stock_item_id","seq");