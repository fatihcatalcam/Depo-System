-- Veri duzeltmesi; sema degismiyor.

-- "3 KAPI" dolap govdelerinin adinda DOLAP yerine DOKAP yazilmisti (ilk
-- katalog aktariminda gelen yazim hatasi). Uc kart.
UPDATE "stock_items"
SET "name" = replace("name", ' DOKAP ', ' DOLAP '), "updated_at" = now()
WHERE "name" LIKE '% DOKAP %';--> statement-breakpoint

-- Siparis satirinin aciklamasi normalde bilerek anlik kopya: urunun adi
-- sonradan degisse de siparise ne yazildiysa o kalir. Bu bir ad degisikligi
-- degil, yazim hatasi; teslim edilmemis uc sipariste duzeltilmezse stok
-- ekraninda DOLAP, siparis ozetinde ve kagitlarda DOKAP gorunurdu.
UPDATE "order_lines"
SET "description" = replace("description", ' DOKAP ', ' DOLAP ')
WHERE "description" LIKE '% DOKAP %';
