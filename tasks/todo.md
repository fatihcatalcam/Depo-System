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
- [x] 13. Parola özetleme ve oturum jetonu
- [x] 14. Giriş akışı, ayar kaydı, middleware koruması
- [x] 15. Uygulama düzeni ve menü
- [x] 16. Kategori yönetimi ekranı
- [x] 17. Stok listesi ekranı
- [x] 18. Stok kartı detayı, hareket geçmişi, sayım
- [x] 19. Ürün ve reçete ekranı
- [x] 20. Örnek veri ve bütünsel doğrulama

## Plan 2 — Mal kabul ve barkod — tamamlandı (2026-08-08)

- [x] Tedarikçi servisi ve ekranı
- [x] Müşteri servisi, liste / detay / yeni ekranları
- [x] Mal kabul: tedarikçi + irsaliye no + satırlar, tek transaction'da stoğa işleme
- [x] Mal kabul listesi ve detay ekranı
- [x] Telefon kamerasıyla barkod okuma (@zxing)
- [x] A4 barkod etiketi yazdırma sayfası (bwip-js, Code128 SVG)
- [x] Menü yeniden düzenlendi: mobilde 5 sekme + Diğer sayfası

## Plan 3 — Sipariş, teslimat, ödeme — tamamlandı (2026-08-09)

- [x] Sipariş servisi: oluştur / düzenle / onayla / iptal, iskonto, toplamlar
- [x] Onayda reçete dondurma (order_line_components)
- [x] Rezervasyon: taslak stoğu etkilemez, onay rezerve eder
- [x] Bileşen seviyesinde kısmi teslimat + otomatik durum geçişi
- [x] Çift tıklama koruması (idempotency anahtarı)
- [x] Stok yetersizse uyarı + açık onayla eksiye düşürme
- [x] İptalde teslim edilenin iade hareketiyle stoğa dönmesi
- [x] Ödemeler: kısmi ödeme, yöntem, kalan bakiye, ödeme silme
- [x] Sipariş listesi (durum filtreleri, toplam kalan alacak)
- [x] Sipariş detayı: malzemeler, teslimat geçmişi, ödeme paneli
- [x] Ana sayfa yenilendi: bugünkü teslimat, geciken sipariş, kalan alacak, kritik stok

## Plan 4 — Sevkiyat, çıktılar, raporlar — tamamlandı (2026-08-09)

- [x] Günlük sevkiyat ekranı: tarih seçici, duraklar, toplama listesi, tahsilat toplamı
- [x] Şoför sevkiyat kâğıdı çıktısı (adres, telefon, malzeme, tahsilat, imza)
- [x] Depo toplama listesi çıktısı (parça parça toplam, işaret kutucuğu)
- [x] Sipariş formu çıktısı (reçete dökümü, iskonto, ödenen, kalan, ödemeler)
- [x] Dönemsel özet çıktısı
- [x] Raporlar: günlük / haftalık / aylık; ciro, tahsilat, alacak, stok değeri, en çok satanlar
- [x] Excel dışa aktarma: stok, müşteriler, siparişler + alacaklar, dönem raporu
- [x] Excel içe aktarma: müşteri ve stok kartları, şablon indirme, hepsi-ya-hiçbiri
- [x] Ayarlar: firma bilgileri, parola değiştirme, stok bakiyesi yeniden hesaplama
- [x] Sipariş detayında teslimat planı düzenleme

---

## Açık konular

- ~~Fiyatlandırma modeli~~ **karara bağlandı (2026-08-09):** ürünün bir liste fiyatı olur,
  siparişe otomatik gelir, sipariş girerken satır bazında değiştirilebilir. Zaten kurulu olan
  yapı bu; ek geliştirme gerekmedi.
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
