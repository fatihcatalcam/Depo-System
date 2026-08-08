# Depo Sistemi — Görev Takibi

Tasarım: `docs/superpowers/specs/2026-08-08-depo-sistemi-design.md`

## Plan 1 — Temel altyapı ve stok çekirdeği
Ayrıntılı adımlar: `docs/superpowers/plans/2026-08-08-plan-1-temel-ve-stok.md`

- [x] 1. Proje iskeleti ve test altyapısı (Next.js 16.3, Vitest 4)
- [ ] 2. Veritabanı bağlantısı, tipler, PGlite test yardımcısı
- [ ] 3. Katalog şeması (kategori, stok kartı, ürün, reçete)
- [ ] 4. Kalan şema (taraflar, belgeler, sistem tabloları)
- [ ] 5. Para birimi yardımcıları (kuruş)
- [ ] 6. Belge numarası sayacı
- [ ] 7. Stok hareket defteri (applyMovements)
- [ ] 8. Serbest stok ve rezervasyon hesabı
- [ ] 9. Sayım düzeltme
- [ ] 10. Kategori servisi
- [ ] 11. Stok kartı servisi
- [ ] 12. Ürün reçetesi ve boyut kopyalama
- [ ] 13. Parola özetleme ve oturum jetonu
- [ ] 14. Giriş akışı, ayar kaydı, middleware koruması
- [ ] 15. Uygulama düzeni ve menü
- [ ] 16. Kategori yönetimi ekranı
- [ ] 17. Stok listesi ekranı
- [ ] 18. Stok kartı detayı, hareket geçmişi, sayım
- [ ] 19. Ürün ve reçete ekranı
- [ ] 20. Örnek veri ve bütünsel doğrulama

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
- **Neon veritabanı** — Vercel Marketplace üzerinden oluşturulup `DATABASE_URL` alınacak.
  Vercel CLI kurulu değil (`npm i -g vercel`).

## Değerlendirme

_(Her plan bittiğinde buraya sonuç özeti yazılacak.)_
