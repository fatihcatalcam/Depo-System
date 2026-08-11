-- Iki sube, ayri girisler, ortak stok.
--
-- Bu dosya drizzle-kit'in urettigi haliyle CALISMAZ; elle duzeltildi:
--   1. Uretilen SQL, `branch_code` kolonunu eklemeden once onu birincil
--      anahtara koyuyordu.
--   2. Dolu tablolara dogrudan NOT NULL kolon ekliyordu.
-- Ikisi de once ekle - doldur - sonra kisitla sirasina cevrildi.
--
-- Mevcut veri tek subeden geliyor; hepsi S1'e atanir.

CREATE TABLE "branches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"password_hash" text,
	"failed_attempts" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "branches_code_unique" UNIQUE("code")
);
--> statement-breakpoint

-- Parolalar bos birakiliyor: her sube icin yonetici Ayarlar'dan belirler.
-- Parolasi olmayan subeye giris yapilamaz.
INSERT INTO "branches" ("code", "name") VALUES ('S1', 'Sube 1'), ('S2', 'Sube 2');--> statement-breakpoint

ALTER TABLE "customers" ADD COLUMN "branch_id" uuid;--> statement-breakpoint
ALTER TABLE "goods_receipts" ADD COLUMN "branch_id" uuid;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "branch_id" uuid;--> statement-breakpoint

UPDATE "customers" SET "branch_id" = (SELECT "id" FROM "branches" WHERE "code" = 'S1');--> statement-breakpoint
UPDATE "goods_receipts" SET "branch_id" = (SELECT "id" FROM "branches" WHERE "code" = 'S1');--> statement-breakpoint
UPDATE "orders" SET "branch_id" = (SELECT "id" FROM "branches" WHERE "code" = 'S1');--> statement-breakpoint

ALTER TABLE "customers" ALTER COLUMN "branch_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "goods_receipts" ALTER COLUMN "branch_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "branch_id" SET NOT NULL;--> statement-breakpoint

ALTER TABLE "customers" ADD CONSTRAINT "customers_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint

CREATE INDEX "customers_branch_idx" ON "customers" USING btree ("branch_id");--> statement-breakpoint
CREATE INDEX "goods_receipts_branch_idx" ON "goods_receipts" USING btree ("branch_id");--> statement-breakpoint
CREATE INDEX "orders_branch_status_idx" ON "orders" USING btree ("branch_id","status","planned_delivery_date");--> statement-breakpoint

-- Belge sayaclari sube basina ilerler. Mevcut subeye ozel sayaclar S1'e,
-- ortak olanlar (stok karti, urun, tedarikci) bos koda kalir.
ALTER TABLE "document_counters" ADD COLUMN "branch_code" text DEFAULT '' NOT NULL;--> statement-breakpoint
UPDATE "document_counters" SET "branch_code" = 'S1'
	WHERE "doc_type" IN ('customer', 'goodsReceipt', 'order', 'delivery');--> statement-breakpoint
ALTER TABLE "document_counters" DROP CONSTRAINT "document_counters_doc_type_year_pk";--> statement-breakpoint
ALTER TABLE "document_counters" ADD CONSTRAINT "document_counters_doc_type_branch_code_year_pk" PRIMARY KEY("doc_type","branch_code","year");
