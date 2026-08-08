# Depo Sistemi — Görev Takibi

Tasarım: `docs/superpowers/specs/2026-08-08-depo-sistemi-design.md`

## Plan 1 — Temel altyapı ve stok çekirdeği
Ayrıntılı adımlar: `docs/superpowers/plans/2026-08-08-plan-1-temel-ve-stok.md`

- [x] 1. Proje iskeleti ve test altyapısı (Next.js 16.3, Vitest 4)
- [x] 2. Veritabanı bağlantısı, tipler, PGlite test yardımcısı
- [x] 3. Katalog şeması (kategori, stok kartı, ürün, reçete)
- [x] 4. Kalan şema (taraflar, belgeler, sistem tabloları)
- [x] 5. Para birimi yardımcıları (kuruş)
- [x] 6. Belge numarası sayacı
- [x] 7. Stok hareket defteri (applyMovements)
- [x] 8. Serbest stok ve rezervasyon hesabı
- [x] 9. Sayım düzeltme
- [x] 10. Kategori servisi
- [x] 11. Stok kartı servisi
- [x] 12. Ürün reçetesi ve boyut kopyalama
- [x] - [ ] 13. Parola özetleme ve oturum jetonu
- [x] - [ ] 14. Giriş akışı, ayar kaydı, middleware koruması
- [x] - [ ] 15. Uygulama düzeni ve menü
- [x] - [ ] 16. Kategori yönetimi ekranı
- [x] - [ ] 17. Stok listesi ekranı
- [x] - [ ] 18. Stok kartı detayı, hareket geçmişi, sayım
- [x] - [ ] 19. Ürün ve reçete ekranı
- [x] 20. Örnek veri ve bütünsel doğrulama

## Plan 2 — Mal kabul ve barkod (planı henüz yazılmadı)
Tedarikçiler, mal kabul akışı, barkod okuma, etiket basma, müşteri yönetimi.

## Plan 3 — Sipariş, teslimat, ödeme (planı henüz yazılmadı)
Sipariş oluşturma, reçete dondurma, rezervasyon, kısmi teslimat, ödemeler ve kalan bakiye.

## Plan 4 — Sevkiyat, PDF, raporlar (planı henüz yazılmadı)
Günlük sevkiyat ekranı, dört PDF çıktısı, dönemsel raporlar, Excel içe/dışa aktarma, PWA rötuşu.

---

## Açık konular

- **Fiyatlandırma modeli** — müşteriye sorulacak. Seçilen yapı (opsiyonel liste fiyatı + her zaman
  düzenlenebilir satır fiyatı) her iki tercihi de karşılıyor, karar Plan 3'e kadar bekleyebilir.
- **Başlangıç parolası `depo2026`** — Vercel'de üç ortama da yazıldı. Müşteriye teslimden önce
  değiştirilmeli. Parola değiştirme ekranı Plan 4'te geliyor; o zamana kadar
  `vercel env rm/add INITIAL_APP_PASSWORD` ile ve veritabanındaki `app_settings.password_hash`
  satırı temizlenerek değişir.
- **Dağıtım yapılmadı.** Vercel projesi hazır ve GitHub'a bağlı ama bilinçli olarak deploy
  edilmedi — dışarıya açılan bir adım, senin onayınla yapılmalı.

## Değerlendirme

### Plan 1 — tamamlandı (2026-08-08)

Çalışan bir stok yönetim uygulaması: parola korumalı giriş, kategori ağacı, parça bazlı stok
kartları, değiştirilemez hareket defteri, sayım düzeltme, ürün reçeteleri ve boyut kopyalama.
Telefon ve bilgisayarda çalışıyor. **121 test geçiyor**, `tsc`, `eslint` ve üretim derlemesi temiz.

Altyapı: Vercel projesi `depo-system` (GitHub bağlı), Neon Postgres `depo-db` (Frankfurt,
ücretsiz plan, Neon Auth kapalı), göçler uygulandı, örnek veri yüklü.

Tarayıcıda uçtan uca doğrulandı: hatalı/doğru parola, stok listesi, sayım düzeltme
(defterde `-7` izi + kritik seviye uyarısının ana sayfaya yansıması), boyut kopyalamanın
hem başarı hem hata yolu, mobil düzen. Konsolda hata yok.

Plan yürütülürken düzeltilen sapmalar planın kendisine işlendi; en önemlileri:
Next.js 16'da `middleware.ts` → `proxy.ts`, hareket defterine monoton `seq` sütunu,
panel rotalarının `force-dynamic` yapılması (statik üretim stok rakamlarını donduruyordu),
shadcn Button'ın Base UI tabanlı olması nedeniyle `asChild` yerine `buttonVariants`.
