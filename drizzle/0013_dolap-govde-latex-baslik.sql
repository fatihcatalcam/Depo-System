-- Veri duzeltmesi; sema degismiyor.

-- Dolap govdeleri ile kapaklari ayri kartlar. Govdenin adinda bunu soyleyen
-- bir sey yoktu: "MONERRA DOLAP 2 KAPI" hem govde hem takim gibi okunuyordu.
-- Sonuna GVD gelince listede hangisinin govde oldugu goruluyor.
--
-- Kapak kartlarina ("... KAPAK TEK AYNA" gibi) dokunulmuyor: onlarin ne
-- oldugu adinda zaten yaziyor.
UPDATE "stock_items"
SET "name" = "name" || ' GVD', "updated_at" = now()
WHERE ("name" LIKE '% DOLAP %' OR "name" LIKE '% DOKAP %')
  AND "name" NOT LIKE '% GVD';--> statement-breakpoint

-- Latex Master basliklar yataktan 10 cm genis; kartlardaki olculer yatak
-- olculeriyle yazilmisti. Boyutlar 10'ar cm buyuyor: 150->160 ... 200->210.
--
-- Esleme acik yaziliyor, "+10" hesabiyla degil: hangi kartin ne olacagi
-- bakinca gorulsun ve yanlislikla baska bir baslik serisi kapsama girmesin.
UPDATE "stock_items"
SET "size_label" = CASE "size_label"
      WHEN '150 CM' THEN '160 CM'
      WHEN '160 CM' THEN '170 CM'
      WHEN '180 CM' THEN '190 CM'
      WHEN '200 CM' THEN '210 CM'
    END,
    "updated_at" = now()
WHERE "name" = 'LATEX MASTER BASLIK'
  AND "size_label" IN ('150 CM', '160 CM', '180 CM', '200 CM');
