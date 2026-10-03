# Dersler

Her duzeltmeden sonra buraya bir kural. Oturum basinda okunur.

## Komutlar

- **Dogrulama komutunu borudan gecirip `&&` ile commit'e baglama.**
  `npx tsc --noEmit 2>&1 | head && git commit` — borunun cikis kodu `head`'in,
  tsc'nin degil; tip hatasi varken commit gecti (2026-09-30). Once
  `npx tsc --noEmit; echo "tsc $?"`, sonra ayri komutta commit.
- Uzun Python/TS icerigi Bash heredoc'una yazma: tirnaklar ve backtick'ler
  heredoc'u bozuyor. Betigi Write ile scratchpad'e yaz, `python <yol>` ile calistir.
- Bu projede `prettier` yok; `npx prettier` calistirma (tek tirnaklari cift
  tirnaga ceviriyor, projenin bicimi degil).
- **`git stash` kullanma; ozellikle `stash push ...; stash pop` zinciri hic.**
  Izlenmeyen bir dosyayi stash'lemek sessizce basarisiz oldu, ardindan gelen
  `pop` depoda onceden duran BASKA bir stash'i ("kilit parolasi ayrimi
  (beklemede)") yarim uyguladi, 10 dosyada cakisma cikti (2026-10-03). Bu
  depoda kullanicinin bekleyen bir stash'i var. Bir degisikligi gecici geri
  almak gerekiyorsa dosyanin yedegini scratchpad'e kopyala, sonra geri kopyala.

## Veritabani

- Drizzle gocleri **bekleyen hepsini tek transaction'da** calistiriyor. Yeni
  enum degeri (`ALTER TYPE ... ADD VALUE`) ayni transaction'da enum olarak
  kullanilamiyor; kisitlarda `kolon::text IN (...)` ile karsilastir. Ayri goc
  dosyasina koymak yetmez.
- Kuru deneme betiginde de ayni kural: yeni enum degerini okumak icin
  `enum_range()` degil `pg_enum` katalogu.
- Canli veride her goc once `BEGIN ... ROLLBACK` ile denenir; ciktisi
  kullaniciya gosterilir.
- ROLLBACK sira sayaclarini (bigserial, `stock_movements_seq_seq`) geri almaz.
  Kuru denemeden sonra anlik goruntuyle karsilastir; yalnizca sayac farkliysa
  ve arada gercek kayit yoksa `setval` ile geri al (2026-10-03).

## Arayuz

- Sunucu eylemine gonderilen alani degistirince (ornegin `deposit` ->
  `deposits`) formu da ayni commit'te degistir: zod bilinmeyen alani sessizce
  atiyor, kapora hic hata vermeden kaybolurdu.
- Istemci bileseni, sunucu kodu iceren bir moduldan **deger** import etmesin
  (etiketler, sabitler). `src/lib/` altinda sunucusuz modul kullan.

## Tarayici paneli

- Panelin ekran goruntusu bazen bir adim geriden geliyor; alan degerini
  `javascript_tool` ile oku, goruntuye guvenme.
- Panel zamanlayicilari kisiyor (setTimeout ~1 sn). Hiz olcerken
  `MutationObserver` + `performance.now()` kullan; ilk olcum 1 sn cikmisti,
  gercegi 25 ms.
- Canli veritabaninda deneme kaydi: once sayim + sayac anlik goruntusu,
  temizlik betigi numara + ad + durum birlikte tutmazsa dokunmaz, once
  ROLLBACK ile onizleme, sonra uygulama, sonra anlik goruntuyle karsilastirma.
