CREATE TABLE "stock_balances" (
	"branch_id" uuid NOT NULL,
	"stock_item_id" uuid NOT NULL,
	"quantity_on_hand" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stock_balances_branch_id_stock_item_id_pk" PRIMARY KEY("branch_id","stock_item_id")
);
--> statement-breakpoint
ALTER TABLE "branches" ADD COLUMN "is_central" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "app_settings" ADD COLUMN "unlock_password_hash" text;--> statement-breakpoint
ALTER TABLE "stock_balances" ADD CONSTRAINT "stock_balances_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_balances" ADD CONSTRAINT "stock_balances_stock_item_id_stock_items_id_fk" FOREIGN KEY ("stock_item_id") REFERENCES "public"."stock_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "stock_balances_branch_idx" ON "stock_balances" USING btree ("branch_id");--> statement-breakpoint
CREATE UNIQUE INDEX "branches_central_uq" ON "branches" USING btree ("is_central") WHERE "branches"."is_central";--> statement-breakpoint

-- Sube 1 merkez oluyor: butun subelerin siparislerini, musterilerini ve
-- cirosunu gorur. Stok buna dahil degil, o hep kendi deposu.
-- Kod "S1" olarak kaliyor: mevcut belge numaralari (SP-S1-2026-00001) ona bagli.
UPDATE "branches" SET "name" = 'Merkez', "is_central" = true WHERE "code" = 'S1';--> statement-breakpoint

-- Yonetici hesabi kaldirildi. Ozeti duruyor ama artik yalnizca stok ve rapor
-- kilidini aciyor; giris ekraninda hicbir hesap acmiyor.
UPDATE "app_settings" SET "unlock_password_hash" = "password_hash";--> statement-breakpoint

-- Stok hareketleri subeye baglaniyor. Once bos kolon, sonra gecmis hareketlerin
-- merkeze yazilmasi, sonra NOT NULL: tablo dolu olsa da goc calissin.
ALTER TABLE "stock_movements" ADD COLUMN "branch_id" uuid;--> statement-breakpoint
UPDATE "stock_movements" SET "branch_id" = (SELECT "id" FROM "branches" WHERE "is_central" LIMIT 1) WHERE "branch_id" IS NULL;--> statement-breakpoint
DELETE FROM "stock_movements" WHERE "branch_id" IS NULL;--> statement-breakpoint
ALTER TABLE "stock_movements" ALTER COLUMN "branch_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
DROP INDEX "stock_movements_item_idx";--> statement-breakpoint
CREATE INDEX "stock_movements_item_idx" ON "stock_movements" USING btree ("branch_id","stock_item_id","seq");--> statement-breakpoint

-- Adet artik kartin uzerinde degil, sube basina tutuluyor. Mevcut adetlerin
-- tamami sifir oldugu icin tasinacak veri yok; her sube kendi sayimini girecek.
ALTER TABLE "stock_items" DROP COLUMN "quantity_on_hand";
