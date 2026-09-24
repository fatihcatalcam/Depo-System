ALTER TABLE "branches" ADD COLUMN "stock_branch_id" uuid;--> statement-breakpoint
ALTER TABLE "branches" ADD CONSTRAINT "branches_stock_branch_id_branches_id_fk" FOREIGN KEY ("stock_branch_id") REFERENCES "public"."branches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint

-- Fiziksel depo tek: iki sube de merkezin deposundan satiyor. Boylece ayni
-- adetleri gorurler ve biri satinca digerinin serbest stogu da duser.
--
-- Bir onceki gocte stok subeye ayrilmisti; isletmede ikinci bir depo olmadigi
-- icin o ayrim iki subeyi ayni mali iki kere satabilir hale getiriyordu.
-- Kolon duruyor: ikinci depo acildiginda degisecek tek sey buradaki deger.
UPDATE "branches" SET "stock_branch_id" = (SELECT "id" FROM "branches" WHERE "is_central" LIMIT 1);--> statement-breakpoint

-- Merkez yoksa (gocler bos bir veritabaninda sirayla kosuyorsa) her sube
-- kendi deposunu gosterir; NOT NULL kisiti bos satir birakmasin.
UPDATE "branches" SET "stock_branch_id" = "id" WHERE "stock_branch_id" IS NULL;--> statement-breakpoint
ALTER TABLE "branches" ALTER COLUMN "stock_branch_id" SET NOT NULL;
