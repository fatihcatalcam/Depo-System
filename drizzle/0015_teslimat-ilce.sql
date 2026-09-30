ALTER TABLE "orders" ADD COLUMN "delivery_city" text DEFAULT 'İstanbul' NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "delivery_district" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "delivery_country" text DEFAULT 'Türkiye' NOT NULL;--> statement-breakpoint

-- Mevcut siparislerin ilcesi, adres metninden. Yalnizca adreste **tam olarak
-- bir** Istanbul ilcesi geciyorsa yaziliyor; iki ilce geciyorsa (ornegin
-- "Fatih Sultan Mehmet Cad., Ümraniye") hangisinin dogru oldugu bilinemez,
-- bos kaliyor ve formdan girilir.
--
-- Eslesme kelime sinirinda (\m ... \M): "Kartaltepe Mah." Kartal
-- ilcesine yazilmasin. Turkce harfler ASCII'ye indiriliyor ki "BAŞAKŞEHİR"
-- ile "basaksehir" ayni sayilsin; esleme src/lib/text.ts ile ayni.
WITH district(name, folded) AS (
  VALUES
  ('Adalar', 'adalar'),
  ('Arnavutköy', 'arnavutkoy'),
  ('Ataşehir', 'atasehir'),
  ('Avcılar', 'avcilar'),
  ('Bağcılar', 'bagcilar'),
  ('Bahçelievler', 'bahcelievler'),
  ('Bakırköy', 'bakirkoy'),
  ('Başakşehir', 'basaksehir'),
  ('Bayrampaşa', 'bayrampasa'),
  ('Beşiktaş', 'besiktas'),
  ('Beykoz', 'beykoz'),
  ('Beylikdüzü', 'beylikduzu'),
  ('Beyoğlu', 'beyoglu'),
  ('Büyükçekmece', 'buyukcekmece'),
  ('Çatalca', 'catalca'),
  ('Çekmeköy', 'cekmekoy'),
  ('Esenler', 'esenler'),
  ('Esenyurt', 'esenyurt'),
  ('Eyüpsultan', 'eyupsultan'),
  ('Fatih', 'fatih'),
  ('Gaziosmanpaşa', 'gaziosmanpasa'),
  ('Güngören', 'gungoren'),
  ('Kadıköy', 'kadikoy'),
  ('Kağıthane', 'kagithane'),
  ('Kartal', 'kartal'),
  ('Küçükçekmece', 'kucukcekmece'),
  ('Maltepe', 'maltepe'),
  ('Pendik', 'pendik'),
  ('Sancaktepe', 'sancaktepe'),
  ('Sarıyer', 'sariyer'),
  ('Silivri', 'silivri'),
  ('Sultanbeyli', 'sultanbeyli'),
  ('Sultangazi', 'sultangazi'),
  ('Şile', 'sile'),
  ('Şişli', 'sisli'),
  ('Tuzla', 'tuzla'),
  ('Ümraniye', 'umraniye'),
  ('Üsküdar', 'uskudar'),
  ('Zeytinburnu', 'zeytinburnu'),
  ('Eyüpsultan', 'eyup')
),
matched AS (
  SELECT o.id, min(d.name) AS name, count(DISTINCT d.name) AS n
  FROM "orders" o
  JOIN district d
    ON lower(translate(o.delivery_address, 'İIıŞşĞğÜüÖöÇç', 'iiissgguuoocc'))
       ~ ('\m' || d.folded || '\M')
  WHERE o.delivery_district IS NULL
  GROUP BY o.id
)
UPDATE "orders" o
SET "delivery_district" = m.name
FROM matched m
WHERE m.id = o.id AND m.n = 1;
