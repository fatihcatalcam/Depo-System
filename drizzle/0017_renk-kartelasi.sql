CREATE TABLE "color_palettes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"codes" text[] DEFAULT '{}'::text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "color_palettes_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "order_line_colors" (
	"order_line_id" uuid NOT NULL,
	"base_stock_item_id" uuid NOT NULL,
	"color_code" text NOT NULL,
	CONSTRAINT "order_line_colors_order_line_id_base_stock_item_id_pk" PRIMARY KEY("order_line_id","base_stock_item_id")
);
--> statement-breakpoint
ALTER TABLE "stock_items" ADD COLUMN "color_palette_id" uuid;--> statement-breakpoint
ALTER TABLE "stock_items" ADD COLUMN "parent_stock_item_id" uuid;--> statement-breakpoint
ALTER TABLE "order_line_colors" ADD CONSTRAINT "order_line_colors_order_line_id_order_lines_id_fk" FOREIGN KEY ("order_line_id") REFERENCES "public"."order_lines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_line_colors" ADD CONSTRAINT "order_line_colors_base_stock_item_id_stock_items_id_fk" FOREIGN KEY ("base_stock_item_id") REFERENCES "public"."stock_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_items" ADD CONSTRAINT "stock_items_color_palette_id_color_palettes_id_fk" FOREIGN KEY ("color_palette_id") REFERENCES "public"."color_palettes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_items" ADD CONSTRAINT "stock_items_parent_stock_item_id_stock_items_id_fk" FOREIGN KEY ("parent_stock_item_id") REFERENCES "public"."stock_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "stock_items_parent_idx" ON "stock_items" USING btree ("parent_stock_item_id");--> statement-breakpoint
ALTER TABLE "stock_items" ADD CONSTRAINT "stock_items_parent_variant_uq" UNIQUE("parent_stock_item_id","variant_label");--> statement-breakpoint
ALTER TABLE "stock_items" ADD CONSTRAINT "stock_items_color_card_chk" CHECK ("stock_items"."parent_stock_item_id" IS NULL OR ("stock_items"."variant_label" IS NOT NULL AND "stock_items"."color_palette_id" IS NULL));--> statement-breakpoint

-- Dukkanin kartelalari (fotograflardan). Latex Master ile Comfizone ayni
-- kumaslari kullaniyor; Vanilla yalnizca "bambi" kartelasiyla yapiliyor.
INSERT INTO "color_palettes" ("name", "codes") VALUES
  ('Latex Master / Comfizone', ARRAY['BK-51','BK-125','BK-128','BK-129','BK-144','BK-145','BK-148','BK-149','BK-150','BK-156','BK-170','BK-171','BK-172']),
  ('Vanilla (bambi)', ARRAY['BK-178','BK-179','BK-180','BK-181','BK-182']);--> statement-breakpoint

-- Renk yalnizca baza ve baslikta; yatak renksiz. Ana kartlar, tam ad.
UPDATE "stock_items"
SET "color_palette_id" = (SELECT "id" FROM "color_palettes" WHERE "name" = 'Latex Master / Comfizone'),
    "updated_at" = now()
WHERE "parent_stock_item_id" IS NULL
  AND "name" IN ('LATEX MASTER BAZA', 'LATEX MASTER BASLIK', 'COMFİZONE BAZA', 'COMFİZONE BASLIK');--> statement-breakpoint

UPDATE "stock_items"
SET "color_palette_id" = (SELECT "id" FROM "color_palettes" WHERE "name" = 'Vanilla (bambi)'),
    "updated_at" = now()
WHERE "parent_stock_item_id" IS NULL
  AND "name" IN ('VANILLA BAZA', 'VANILLA BASLIK');
