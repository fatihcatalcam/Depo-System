# Depo Yönetim Sistemi — Tasarım Dokümanı

**Tarih:** 2026-08-08
**Durum:** Onaylandı (tasarım), uygulama planı bekliyor

---

## 1. Amaç

Mobilya (ağırlıklı yatak ve baza) satan bir işletmenin bugün kara kalem ve dağınık Excel dosyalarıyla yürüttüğü işi tek sisteme almak. Bugünkü dört acı nokta:

1. Fabrikadan gelen sevkiyatı stoğa girmek zor
2. Stok takibi zor
3. Sipariş takibi zor
4. Ödeme takibi zor

Sistem bilgisayardan ve telefondan çalışan bir web uygulaması olacak; listeler birbirine entegre olacak (müşteri → sipariş → stok → teslimat → ödeme aynı zincirde).

---

## 2. Karar özeti

| Konu | Karar | Gerekçe |
|---|---|---|
| Barındırma | Bulut (Vercel + Neon Postgres) | Her yerden erişim, düşük maliyet, bakım yükü yok |
| Kullanıcı/rol | Tek ortak hesap | Müşteri tercihi. Rol katmanı sonradan eklenebilir yapıda kurulacak |
| Stok birimi | Parça + boyut bazlı stok kartı; ürün = reçete | Gerçekte sayılan şey parçadır; set satışı reçeteyle çözülür |
| Excel | Hem içe hem dışa aktarma | Mevcut listeler taşınacak, muhasebeye çıktı verilecek |
| Kısmi teslimat | Var | "Yatak bugün, baza hafta sonu" gerçek bir senaryo |
| Stok mantığı | Siparişte rezerve, teslimatta düş; yetersizse uyar, engelleme | Aynı malı iki kez satmayı önler, ön sipariş almayı engellemez |
| Ödeme | Kısmi ödeme + kalan bakiye, ödeme yöntemi | KDV ve vade takibi v1 kapsamı dışı |
| Sevkiyat planı | Sadece teslimat tarihi, şoför ataması yok | Tek liste, tek PDF |
| Mal kabul | Tedarikçi + irsaliye no ile | "Bu mal ne zaman kimden geldi" cevaplanabilsin |
| Barkod | Var (telefon kamerasıyla okuma + etiket basma) | Mal kabul ve teslimat hızlanır |
| Raf/bölge | Yok, tek depo | Gereksiz veri girişi yükü |
| Fiyat | Liste fiyatı opsiyonel + satır fiyatı her zaman elle değiştirilebilir | Müşteri kararı netleşmedi; bu yapı her iki tercihi de karşılar |

### Kod dili hakkında bir düzeltme

Tasarım görüşmesinde tablo adlarını Türkçe konuşmuştuk (`stok_kartlari`, `siparisler`). Uygulamada **veritabanı ve kod tarafında İngilizce, arayüzde tamamen Türkçe** kullanacağım. Sebep: Türkçe'nin noktalı/noktasız `i` harfi SQL ve ORM katmanlarında sessiz büyük-küçük harf hatalarına yol açar (`ISPARIS` / `isparis`), çoğul ekleri ORM kurallarıyla çakışır. Kullanıcı hiçbir zaman tablo adı görmeyecek. Karşılıklar aşağıdaki sözlükte.

| Türkçe (arayüz) | İngilizce (kod) |
|---|---|
| Kategori | `categories` |
| Stok kartı | `stock_items` |
| Ürün (set) | `products` |
| Reçete | `product_components` |
| Müşteri | `customers` |
| Tedarikçi | `suppliers` |
| Mal kabul | `goods_receipts` |
| Sipariş | `orders` |
| Sipariş satırı | `order_lines` |
| Satır bileşeni | `order_line_components` |
| Teslimat | `deliveries` |
| Ödeme | `payments` |
| Stok hareketi | `stock_movements` |

---

## 3. Teknoloji

| Katman | Seçim |
|---|---|
| Framework | Next.js 16 (App Router), TypeScript |
| Veritabanı | Neon Postgres (Vercel Marketplace) |
| ORM / migration | Drizzle + drizzle-kit |
| Mutasyonlar | Server Actions, girdi doğrulaması `zod` ile |
| Arayüz | Tailwind CSS v4 + shadcn/ui |
| PDF | `@react-pdf/renderer`, Türkçe destekli gömülü font |
| Excel | `exceljs` |
| Barkod okuma | `@zxing/browser` (telefon kamerası) |
| Barkod çizimi | `bwip-js` (Code128) |
| Oturum | `jose` ile imzalı httpOnly çerez |
| Tarih | `date-fns` + `tr` yerelleştirmesi |
| Mobil | Responsive + PWA (ana ekrana eklenebilir) |

**Para birimi:** Tüm tutarlar **kuruş cinsinden tam sayı** (`bigint`) olarak saklanır. Ondalıklı sayı kullanılırsa `40.000 + 10.000 ≠ 50.000` hataları çıkar ve ödeme takibinde bu affedilmez. Gösterim katmanında TL'ye çevrilir.

**Zaman dilimi:** `Europe/Istanbul`. Takvim günü ifade eden alanlar `date`, olay anları `timestamptz`.

---

## 4. Veri modeli

### 4.1 Katalog

**`categories`** — iç içe geçebilen ağaç (Yatak > Yaylı Yatak)

| Alan | Tip | Not |
|---|---|---|
| id | uuid | PK |
| name | text | zorunlu |
| parent_id | uuid? | → categories.id, silme: restrict |
| sort_order | int | varsayılan 0 |
| created_at / updated_at | timestamptz | |

Kısıt: `unique (parent_id, name)`. Kendi kendine döngü uygulama katmanında engellenir.

**`stock_items`** — stok kartı. **Sistemde sayılan tek şey budur.**

| Alan | Tip | Not |
|---|---|---|
| id | uuid | PK |
| sku | text | benzersiz, otomatik `SK-00001` |
| name | text | "Yatak A – Başlık" |
| size_label | text? | "90x190" |
| category_id | uuid? | → categories |
| barcode | text? | benzersiz |
| unit | text | varsayılan `adet` |
| min_stock_level | int | kritik seviye, varsayılan 0 |
| quantity_on_hand | int | **önbellek**; hareket defteriyle aynı transaction'da güncellenir |
| purchase_price_kurus | bigint? | stok değeri raporu için |
| is_active | boolean | varsayılan true |
| notes | text? | |

İndeksler: `name` (trigram arama), `barcode`, `category_id`.

**`products`** — müşteriye satılan set. **Kendi başına stoğu yoktur.**

| Alan | Tip | Not |
|---|---|---|
| id | uuid | PK |
| code | text | benzersiz, `UR-00001` |
| name | text | "Yatak A 90x190 Tek Kişilik" |
| category_id | uuid? | |
| default_price_kurus | bigint? | **boş bırakılabilir** |
| is_active | boolean | |
| notes | text? | |

**`product_components`** — reçete

| Alan | Tip | Not |
|---|---|---|
| id | uuid | PK |
| product_id | uuid | → products, cascade |
| stock_item_id | uuid | → stock_items, restrict |
| quantity | int | `> 0` |

Kısıt: `unique (product_id, stock_item_id)`.

### 4.2 Taraflar

**`customers`** — id, code (`MS-00001`), name, phone, phone2, email, address, city, district, tax_office, tax_number, notes, is_active, zaman damgaları. İndeks: name, phone.

**`suppliers`** — id, code (`TD-00001`), name, phone, address, notes, is_active, zaman damgaları.

### 4.3 Mal kabul

**`goods_receipts`** — id, receipt_no (`MK-2026-00001`), supplier_id?, waybill_no? (irsaliye no), received_at (date), notes, created_at.

**`goods_receipt_lines`** — id, goods_receipt_id (cascade), stock_item_id (restrict), quantity (`> 0`), unit_cost_kurus?.

### 4.4 Sipariş

**`orders`**

| Alan | Tip | Not |
|---|---|---|
| id | uuid | PK |
| order_no | text | benzersiz, `SP-2026-00001` |
| customer_id | uuid | → customers, restrict |
| order_date | date | varsayılan bugün |
| planned_delivery_date | date? | sevkiyat listesi bunu kullanır |
| delivery_address | text | **anlık kopya** (müşteriden ön-doldurulur, düzenlenebilir) |
| delivery_phone | text? | |
| delivery_notes | text? | kat, asansör durumu vb. |
| status | text | `draft` \| `confirmed` \| `partially_delivered` \| `delivered` \| `cancelled` |
| subtotal_kurus | bigint | |
| discount_kurus | bigint | sipariş geneline iskonto |
| total_kurus | bigint | `subtotal - discount` |
| notes | text? | |

İndeksler: `(status, planned_delivery_date)`, `(customer_id)`, `(order_no)`.

**`order_lines`**

| Alan | Tip | Not |
|---|---|---|
| id | uuid | PK |
| order_id | uuid | cascade |
| line_no | int | sıra |
| item_type | text | `product` \| `stock_item` |
| product_id | uuid? | restrict |
| stock_item_id | uuid? | restrict |
| description | text | **anlık kopya** — ürün adı sonradan değişse bile sipariş bozulmaz |
| quantity | int | `> 0` |
| unit_price_kurus | bigint | |
| line_total_kurus | bigint | |

Kısıt: `item_type` `product` ise `product_id` dolu ve `stock_item_id` boş; `stock_item` ise tersi.

**`order_line_components`** — **dondurulmuş reçete.** Sistemin kalbi.

| Alan | Tip | Not |
|---|---|---|
| id | uuid | PK |
| order_line_id | uuid | cascade |
| stock_item_id | uuid | restrict |
| quantity_per_unit | int | `> 0` |
| total_quantity | int | `= quantity_per_unit × order_lines.quantity` |
| delivered_quantity | int | varsayılan 0, `0 ≤ delivered ≤ total` |

Kısıt: `unique (order_line_id, stock_item_id)`.

Bu kayıtlar **sipariş onaylandığı anda** (`draft → confirmed`) yazılır ve bir daha ürün tanımına bakılmaz. `draft` durumundaki siparişlerde bileşen kaydı yoktur; taslak ekranındaki stok yeterlilik uyarısı o anki güncel reçeteden anlık hesaplanır. Altı ay sonra "Yatak A"nın reçetesi değişse bile eski siparişler müşteriye söz verilen malzemeyi göstermeye devam eder. **Rezervasyon ve teslimat hesapları yalnızca bu tablodan yürür.**

`stock_item` tipli satırlarda da tek bileşenli bir kayıt yazılır (`quantity_per_unit = 1`) — böylece teslimat mantığı tek yoldan işler.

### 4.5 Teslimat

**`deliveries`** — id, delivery_no (`TS-2026-00001`), order_id (restrict), delivered_at (timestamptz), delivered_by? (serbest metin — teslim eden kişi), receiver_name? (teslim alan), notes, created_at.

**`delivery_lines`** — id, delivery_id (cascade), **order_line_component_id** (restrict), quantity (`> 0`).

Teslimat satırı bileşen seviyesindedir, sipariş satırı seviyesinde değil. "Yatak gitti, baza kaldı" senaryosunun karşılığı budur.

### 4.6 Ödeme

**`payments`** — id, order_id (restrict), amount_kurus (`> 0`), method (`nakit` \| `havale` \| `kart` \| `cek`), paid_at (date), notes, created_at.

### 4.7 Stok hareket defteri

**`stock_movements`** — değiştirilemez kayıt defteri.

| Alan | Tip | Not |
|---|---|---|
| id | uuid | PK |
| stock_item_id | uuid | restrict |
| quantity_change | int | `≠ 0`, artı veya eksi |
| movement_type | text | `goods_receipt` \| `delivery` \| `stock_count` \| `return` \| `scrap` \| `manual` |
| reference_type | text? | kaynak belge tipi |
| reference_id | uuid? | kaynak belge id'si |
| balance_after | int | hareketten sonraki bakiye (denetim kolaylığı) |
| notes | text? | |
| created_at | timestamptz | |

İndeksler: `(stock_item_id, created_at desc)`, `(reference_type, reference_id)`.

### 4.8 Sistem

**`app_settings`** — tek satır (`id = 1` kısıtı): company_name, address, phone, email, tax_info, logo_url, password_hash, updated_at.

**`document_counters`** — belge numarası üretimi: `(doc_type, year)` → `last_number`. Numara üretimi `SELECT ... FOR UPDATE` ile aynı transaction içinde yapılır; iki kişi aynı anda sipariş açtığında aynı numara verilmez.

---

## 5. Temel hesaplamalar

### 5.1 Stok

```
Mevcut  = stock_items.quantity_on_hand
Rezerve = SUM(total_quantity - delivered_quantity)
          FROM order_line_components
          JOIN order_lines / orders
          WHERE orders.status IN ('confirmed', 'partially_delivered')
Serbest = Mevcut - Rezerve
```

Rezerve **ayrı tabloda tutulmaz**, her seferinde sorguyla hesaplanır. Böylece "rezervasyon tablosu ile sipariş tablosunun birbirinden kayması" diye bir hata sınıfı hiç doğmaz. Personelin ekranda gördüğü asıl sayı **Serbest**'tir.

`quantity_on_hand` bir önbellektir; tek doğru kaynak `stock_movements` toplamıdır. Ayarlar ekranında "stok bakiyelerini yeniden hesapla" bakım işlemi bulunur.

### 5.2 Ödeme

```
Ödenen = SUM(payments.amount_kurus)
Kalan  = orders.total_kurus - Ödenen
Durum  = Kalan <= 0 ? 'ödendi' : (Ödenen > 0 ? 'kısmen ödendi' : 'ödenmedi')
```

Notlardaki örnek: 50.000 ₺ sipariş, 40.000 ₺ peşinat → 10.000 ₺ kalan.

### 5.3 Sipariş durumu

```
draft ──onayla──> confirmed ──ilk teslimat──> partially_delivered ──son teslimat──> delivered
  │                   │                              │
  └───────────────────┴──────────────────────────────┴──> cancelled
```

- `draft`: serbestçe düzenlenir, stoğu **etkilemez**
- `confirmed`: rezervasyon başlar
- Tüm bileşenlerde `delivered_quantity = total_quantity` olduğunda otomatik `delivered`
- `cancelled`: rezervasyon düşer. Kısmen teslim edilmiş sipariş iptal edilirken teslim edilen miktarlar için `return` tipi hareket oluşturulur ve kullanıcıdan ayrıca onay istenir
- `confirmed` veya `partially_delivered` durumda satır düzenlenirse bileşenler yeniden hesaplanır; teslim edilmiş bileşen varsa düzenleme engellenir

---

## 6. İş akışları

### 6.1 Mal kabul
Tedarikçi + irsaliye no + tarih girilir. Satırlar barkod okutularak veya arama ile eklenir, adet yazılır. Tek kaydetmede tek transaction içinde: satırlar yazılır, her stok kartı için `+quantity` hareketi düşülür, `quantity_on_hand` artırılır.

### 6.2 Sipariş oluşturma
Müşteri seçilir veya anında oluşturulur. Teslimat adresi müşteri kaydından ön-doldurulur, düzenlenebilir. Satırlara ürün seti veya tek parça eklenir. Fiyat, tanımlıysa otomatik gelir; **her zaman elle değiştirilebilir.** Sipariş geneline iskonto girilebilir. Teslimat tarihi seçilir.

Onaylandığında reçeteler `order_line_components`'a dondurulur. Serbest stok yetmeyen satırlar **sarı uyarı** verir ama sipariş engellenmez — fabrikadan yolda olan mal için ön sipariş alınabilmeli.

### 6.3 Teslimat
Sipariş detayından "Teslimat Yap". Bileşenler kalan miktarlarıyla listelenir, teslim edilecek adetler girilir. Tek transaction içinde: `deliveries` + `delivery_lines` yazılır, `delivered_quantity` artırılır, her stok kartı için `-quantity` hareketi düşülür, `quantity_on_hand` azalır, sipariş durumu yeniden hesaplanır.

### 6.4 Ödeme
Sipariş detayından tutar, yöntem ve tarih girilir. Kalan bakiye anında güncellenir. Ödeme yalnızca **onaylanmış** siparişlere eklenebilir (`draft` hariç tüm durumlar); iptal edilmiş siparişteki mevcut ödemeler silinmez, iade takibi elle yapılır.

### 6.5 Günlük sevkiyat
Bir tarih seçilir. Listeye giren siparişler: `planned_delivery_date` seçilen güne eşit **ve** durumu `confirmed` veya `partially_delivered` olanlar. Her sipariş için yalnızca **henüz teslim edilmemiş** bileşenler gösterilir.

### 6.6 Sayım düzeltme
Stok kartında sayılan gerçek adet girilir; sistem farkı hesaplar ve `stock_count` tipi hareket oluşturur. Fark her zaman defterde iz bırakır.

---

## 7. Ekranlar

Telefonda alt menü (Ana sayfa · Stok · Sipariş · Sevkiyat · Diğer), bilgisayarda sol menü. Depo personeli telefonu ayakta ve elleri doluyken kullanır: büyük dokunma alanları, en sık yapılan iş tek dokunuş uzakta.

| Ekran | İçerik |
|---|---|
| **Giriş** | Tek ortak şifre |
| **Ana sayfa** | Bugün teslim edilecek siparişler, kritik seviyenin altındaki parçalar, toplam kalan alacak, bu ayın cirosu |
| **Stok listesi** | Arama + kategori filtresi. Her satırda **Mevcut / Rezerve / Serbest**. Serbest, kritik seviyenin altındaysa kırmızı |
| **Stok kartı** | Detay + tüm hareket geçmişi (tarih, tip, adet, kaynak belge). Sayım düzeltme, barkod etiketi bas |
| **Kategoriler** | Ağaç yapısında ekleme/düzenleme |
| **Ürünler** | Reçete tanımı. **"90x190'ı kopyala → 100x200 yap"** butonu ile ikinci boyut beş parçayı yeniden yazmadan üretilir |
| **Mal kabul** | Yeni kabul (tedarikçi, irsaliye, barkodla satır ekleme) + geçmiş |
| **Müşteriler** | Liste, arama, detayda siparişler ve toplam borç |
| **Siparişler** | Durum ve ödeme durumuna göre filtreli liste |
| **Sipariş detayı** | Malzemeler, teslim edilen/kalan, ödemeler, kalan bakiye, PDF indir. İki eylem: **Teslimat Yap**, **Ödeme Ekle** |
| **Sevkiyat** | Tarih seçilir → o günün teslimatları, iki PDF çıktısı |
| **Raporlar** | Gün/hafta/ay: sipariş adedi, ciro, tahsilat, kalan alacak, teslimat sayısı, en çok satan ürünler, stok değeri |
| **Ayarlar** | Firma bilgileri (PDF anteni), logo, şifre değiştir, Excel içe/dışa aktarma, stok yeniden hesapla |

---

## 8. PDF çıktıları

Dördü de A4, Türkçe karakter destekli gömülü font (`ş ğ ı İ ç ö ü` bozulmayacak), firma anteni `app_settings`'ten gelir.

1. **Sipariş detayı** — müşteri, teslimat adresi, telefon, malzeme listesi, birim fiyatlar, ara toplam, iskonto, genel toplam, ödenen, **kalan**.
2. **Şoför sevkiyat kağıdı** — seçilen günün her durağı: müşteri, adres, telefon, o adrese inecek malzemeler, tahsil edilecek tutar, teslim alan imza alanı.
3. **Depo toplama listesi** — aynı gün, farklı bakış: müşteri müşteri değil **parça parça toplam**. "Yatak A Başlık 90x190 → 7 adet". Depocu araca yüklerken tek kağıda bakar.
4. **Dönemsel özet** — günlük/haftalık/aylık rapor çıktısı.

## 9. Excel

**İçe aktarma:** müşteriler, stok kartları, ürün reçeteleri. Akış: şablon indir → doldur → yükle → **doğrulama önizlemesi** (hatalı satırlar sebebiyle gösterilir) → onayla. Kısmi aktarma yok; ya hepsi geçer ya hiçbiri.

**Dışa aktarma:** stok listesi, müşteri listesi, sipariş listesi, alacak listesi, dönem raporu.

## 10. Barkod

- `stock_items.barcode` benzersiz. Sistem üretirse SKU tabanlı Code128 (`SK00001`).
- **Etiket basma:** A4 sayfada ızgara düzeninde etiketler, `bwip-js` ile üretilip PDF'e gömülür.
- **Okuma:** `@zxing/browser` ile telefon kamerası. HTTPS gerektirir; Vercel'de mevcut. Kamera izni reddedilirse veya cihaz desteklemezse arama kutusuna otomatik düşülür.
- Kullanım noktaları: mal kabulde satır ekleme, stok arama, teslimatta doğrulama.

---

## 11. Hata durumları ve tutarlılık

| Risk | Önlem |
|---|---|
| Yarım kalan stok işlemi | Mal kabul, teslimat, ödeme ve sayım işlemlerinin tamamı tek veritabanı transaction'ı içinde |
| Çift tıklama / kötü internette iki kez gönderim | Teslimat, ödeme ve mal kabul kaydında istemci tarafından üretilen idempotency anahtarı; aynı anahtar ikinci kez gelirse mevcut kayıt döner |
| Aynı anda iki sipariş numarası | `document_counters` üzerinde `SELECT ... FOR UPDATE` |
| Stoğun eksiye düşmesi | Teslimattan önce kontrol; eksiye düşecekse açık onay istenir, onaylanırsa hareket yine defterde iz bırakır |
| Teslim edilen miktarın siparişi aşması | Veritabanı kısıtı: `delivered_quantity ≤ total_quantity` |
| Ürün tanımı değişince eski siparişin bozulması | Reçete ve açıklama sipariş anında donduruluyor |
| Ondalık para hatası | Tutarlar kuruş cinsinden tam sayı |
| Silinen kaydın geçmişi bozması | Katalog ve taraf kayıtlarında silme yerine `is_active = false`; belgelere `restrict` |

---

## 12. Test stratejisi

**Birim testleri (Vitest)** — sistemin yanlış hesaplarsa güveni bitirecek kısımları:
serbest stok hesabı, rezervasyon sorgusu, kısmi teslimat kalanları, sipariş durumu geçişleri, ödeme bakiyesi, reçete dondurma, iskontolu toplam, belge numarası üretimi.

**Entegrasyon testleri** — gerçek Postgres üzerinde: mal kabul → stok artışı → sipariş → rezervasyon → kısmi teslimat → stok düşüşü → ödeme → bakiye. Transaction geri alma senaryoları.

**Uçtan uca (Playwright)** — kritik akışlar: sipariş oluştur → kısmi teslim → ödeme → PDF indir; mal kabul → stok görünümü; günlük sevkiyat PDF'i.

---

## 13. Yapım sırası

Her adım çalışır bir sistem bırakır; ortada da müşteriye gösterilebilir.

1. **İskelet** — proje kurulumu, Neon bağlantısı, Drizzle migration altyapısı, giriş, ana düzen, PWA
2. **Stok çekirdeği** — kategoriler, stok kartları, hareket defteri, sayım düzeltme
3. **Ürün reçeteleri** — ürün tanımı, reçete, boyut kopyalama
4. **Mal kabul + barkod** — tedarikçiler, mal kabul akışı, barkod okuma, etiket basma
5. **Müşteri ve sipariş** — müşteri yönetimi, sipariş oluşturma, reçete dondurma, rezervasyon
6. **Teslimat** — kısmi teslimat, stok düşümü, durum geçişleri
7. **Ödemeler** — ödeme kaydı, kalan bakiye, alacak listesi
8. **Sevkiyat ve PDF** — günlük sevkiyat ekranı, dört PDF çıktısı
9. **Raporlar ve Excel** — dönemsel özetler, içe/dışa aktarma
10. **Rötuş** — ayarlar, performans, mobil düzen gözden geçirme

---

## 14. Kapsam dışı (v1)

Bilinçli olarak yapılmıyor: KDV hesabı, vade tarihi ve gecikme uyarısı, müşteri bazlı fiyat listesi, rol ve yetki yönetimi, e-fatura/e-irsaliye entegrasyonu, muhasebe programı entegrasyonu, çoklu depo, raf/bölge takibi, şoför ve araç yönetimi, çoklu para birimi, üretim emri, müşteriye SMS/e-posta bildirimi.

Veri modeli bunların hiçbirini engellemiyor; her biri sonradan sınırlı bir eklemeyle gelir.

---

## 15. Bilinen riskler ve açık konular

**Tek ortak hesap.** Müşterinin kararı, öyle uygulanacak. Ama "stoğu kim eksiltti, siparişi kim iptal etti" sorusunun cevabı hiç olmayacak — depo işinde bu er geç sorulur. Giriş katmanı `lib/auth` altında izole yazılacak; rol eklemek istedikleri gün mevcut kod bozulmadan `users` tablosu ve rol kontrolü eklenebilecek.

**Fiyatlandırma modeli.** Müşteriyle konuşulması bekleniyor. Seçilen yapı (opsiyonel liste fiyatı + her zaman düzenlenebilir satır fiyatı) hem "her siparişte elle girilsin" hem "liste fiyatı olsun" tercihini karşılıyor. Müşteri bayi/perakende fiyat listesi isterse bu, `products` üzerine bir fiyat listesi tablosu eklenerek çözülür ve mevcut siparişleri etkilemez.

**Barkod etiketleme düzeni.** Barkod okumanın işe yaraması için depoda etiketlerin fiilen yapıştırılması gerekir. Sistem etiketleri basacak, ama bu bir çalışma alışkanlığı değişikliği; müşteriye baştan söylenmeli.
