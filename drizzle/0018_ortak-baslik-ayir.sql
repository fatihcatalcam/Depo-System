-- Veri duzeltmesi; sema degismiyor.

-- Ortak basliklar ayriliyor. 90 CM ve 140 CM basliklar hem x190 hem x200
-- takiminin recetesinde ayni kartti; stok ekraninda bir satira girilen
-- adet iki satirda birden gorunuyordu. Dukkanin karari: her takimin kendi
-- basligi olsun, stok hangi satira girildiyse orada dursun.
--
-- Iki takimda kullanilan her parca icin:
--   * eski kart kisa takimda kalir; olcusu "140 CM (140x190)" olur,
--   * uzun takim icin yeni kart acilir: "140 CM (140x200)"; ad, kategori,
--     birim, alis fiyati, kritik seviye ve kartela eskisinden,
--   * uzun takimin recetesi yeni karta gecer,
--   * acik siparislerde uzun takimin henuz teslim edilmemis bu bileseni ve
--     secilmis rengi yeni karta gecer (rezerv dogru satira dussun).
-- Stok eski kartta kalir: hangi takim icin geldigi bilinmiyor.
-- Takim olcusu urun adindan okunur ("BOHEMELA 140x200 Set"); ayni genislikte,
-- farkli boyda tam iki takim degilse parca atlanir.
DO $$
DECLARE
  part record;
  short_product uuid;
  long_product uuid;
  short_size text;
  long_size text;
  set_count integer;
  width_count integer;
  length_count integer;
  next_number integer;
  new_sku text;
  new_id uuid;
  moved_components integer;
  moved_colors integer;
  split_count integer := 0;
  skipped integer := 0;
BEGIN
  FOR part IN
    SELECT si.*
    FROM stock_items si
    WHERE si.parent_stock_item_id IS NULL
      AND (SELECT count(*) FROM product_components pc WHERE pc.stock_item_id = si.id) > 1
    ORDER BY si.name, si.size_label
  LOOP
    -- Takimlar adlarindaki olcuyle: ayni genislik, iki farkli boy olmali.
    SELECT count(*), count(DISTINCT m[1]), count(DISTINCT m[2])
    INTO set_count, width_count, length_count
    FROM product_components pc
    JOIN products p ON p.id = pc.product_id
    CROSS JOIN LATERAL regexp_match(p.name, '(\d+)\s*[xX*×]\s*(\d+)') AS m
    WHERE pc.stock_item_id = part.id;

    IF set_count <> 2 OR width_count <> 1 OR length_count <> 2
       OR set_count <> (SELECT count(*) FROM product_components WHERE stock_item_id = part.id) THEN
      skipped := skipped + 1;
      RAISE NOTICE 'atlandi: % %', part.name, part.size_label;
      CONTINUE;
    END IF;

    SELECT p.id, lower(m[1] || 'x' || m[2])
    INTO short_product, short_size
    FROM product_components pc
    JOIN products p ON p.id = pc.product_id
    CROSS JOIN LATERAL regexp_match(p.name, '(\d+)\s*[xX*×]\s*(\d+)') AS m
    WHERE pc.stock_item_id = part.id
    ORDER BY m[2]::int
    LIMIT 1;

    SELECT p.id, lower(m[1] || 'x' || m[2])
    INTO long_product, long_size
    FROM product_components pc
    JOIN products p ON p.id = pc.product_id
    CROSS JOIN LATERAL regexp_match(p.name, '(\d+)\s*[xX*×]\s*(\d+)') AS m
    WHERE pc.stock_item_id = part.id
    ORDER BY m[2]::int DESC
    LIMIT 1;

    -- SKU uygulamadaki gibi: stockItem sayaci, "SK-00569"; barkod tiresiz.
    UPDATE document_counters
    SET last_number = last_number + 1
    WHERE doc_type = 'stockItem' AND branch_code = '' AND year = 0
    RETURNING last_number INTO next_number;
    new_sku := 'SK-' || lpad(next_number::text, 5, '0');

    INSERT INTO stock_items (
      sku, name, size_label, category_id, barcode, unit, min_stock_level,
      purchase_price_kurus, color_palette_id
    )
    VALUES (
      new_sku, part.name, coalesce(part.size_label, '') || ' (' || long_size || ')',
      part.category_id, replace(new_sku, '-', ''), part.unit, part.min_stock_level,
      part.purchase_price_kurus, part.color_palette_id
    )
    RETURNING id INTO new_id;

    UPDATE stock_items
    SET size_label = coalesce(size_label, '') || ' (' || short_size || ')', updated_at = now()
    WHERE id = part.id;

    UPDATE product_components
    SET stock_item_id = new_id
    WHERE product_id = long_product AND stock_item_id = part.id;

    UPDATE order_line_components olc
    SET stock_item_id = new_id
    FROM order_lines ol
    JOIN orders o ON o.id = ol.order_id
    WHERE olc.order_line_id = ol.id
      AND olc.stock_item_id = part.id
      AND olc.delivered_quantity = 0
      AND ol.product_id = long_product
      AND o.status::text IN ('confirmed', 'partially_delivered');
    GET DIAGNOSTICS moved_components = ROW_COUNT;

    UPDATE order_line_colors olr
    SET base_stock_item_id = new_id
    FROM order_lines ol
    WHERE olr.order_line_id = ol.id
      AND olr.base_stock_item_id = part.id
      AND ol.product_id = long_product;
    GET DIAGNOSTICS moved_colors = ROW_COUNT;

    split_count := split_count + 1;
    RAISE NOTICE '% % -> eski % (%), yeni % (%); siparis bileseni %, renk secimi %',
      part.name, part.size_label, part.sku, short_size, new_sku, long_size,
      moved_components, moved_colors;
  END LOOP;

  RAISE NOTICE 'ayrilan: %, atlanan: %', split_count, skipped;
END $$;
