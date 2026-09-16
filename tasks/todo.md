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

## Kullanım düzeltmeleri — tamamlandı (2026-08-11)

- [x] Stok listesindeki +/− hızlı tıklamayı kaybediyordu: dokunuşlar biriktirilip tek
      istekte yazılıyor, butonlar artık kilitlenmiyor, deftere tek satır giriyor
- [x] Adet kutuları boşaltılamıyordu ("2" yazınca "12" oluyordu): ortak `QuantityInput`
      bileşeni, dokununca değer seçili gelir, mobilde de üstüne yazılır

## Plan 5 — İki şube, ayrı girişler, ortak stok — tamamlandı (2026-08-11)

Ayrıntılı adımlar: `docs/superpowers/plans/2026-08-11-plan-5-subeler.md`

- [x] Şema: `branches` tablosu, `orders`/`customers`/`goods_receipts` üzerinde `branch_id`
- [x] Göç: mevcut veri Şube 1'e taşındı (canlıda uygulandı, 4 müşteri / 4 sipariş / 3 mal kabul)
- [x] Belge numaraları şube başına: `SP-S1-2026-00001`
- [x] `Scope` tipi: şubeye özel her fonksiyon zorunlu parametre alıyor
- [x] Üç hesap; giriş ekranında yalnızca şubeler, yönetici kendi parolasıyla
- [x] Hesap başına kilitlenme; şubedeki hatalı denemeler yöneticiyi kilitlemiyor
- [x] Alan katmanı kapsamlandı (sipariş, müşteri, teslimat, ödeme, sevkiyat, rapor, Excel)
- [x] Rezervasyon global kaldı; karşı şubeye "Diğer şube · adet" olarak görünüyor
- [x] Ekranlar: şube rozeti, yöneticide "Şube" sütunu, Ayarlar'da şube yönetimi
- [x] 284 test (21'i çapraz şube izolasyonu, 4'ü göçün taşıma adımı)

**Kalan tek adım (kullanıcıda):** Ayarlar → Şubeler'den iki şubeye parola ver.
Parola verilene kadar giriş ekranında şube düğmesi çıkmaz.

## Uyco katalogu ve örnek veri — tamamlandı (2026-08-22)

- [x] PDF'ten katalog çıkarıldı (`scripts/catalog-data.ts`): 22 model, 3 modüler seri, 20 komodin
- [x] `npm run db:catalog` → 567 stok kartı, 180 set, 5 kategori
- [x] Stok listesinde satır içi **not** alanı (ödünç verme, renk farkı gibi nadir durumlar)
- [x] `npm run db:demo` → 3 tedarikçi, 5 müşteri, 3 mal kabul, 7 sipariş, 3 ödeme
- [x] `reset.ts` artık `app_settings`'i **silmiyor** — yönetici parolası ve firma anteni korunuyor

### Veritabanı komutları

| Komut | Ne yapar |
|---|---|
| `npm run db:backup` | Tüm tabloları JSON'a yazar (`backups/`, git dışında) |
| `npm run db:reset` | İş verisini siler; şube ve ayarlar kalır |
| `npm run db:catalog` | Uyco kataloğunu yükler (stok boş kartlar) |
| `npm run db:demo` | Örnek müşteri/sipariş/teslimat/ödeme yükler |

Gerçek kullanıma geçerken: `db:reset` + `db:catalog`, sonra gerçek adetleri
mal kabul ya da sayımla gir.

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

## Plan 7 — El notundaki yedi madde — tamamlandi (2026-09-11)

- [x] 1. Bekleyen siparisler ekrani: her musterinin bekleyen urunleri acilir liste
- [x] 2. Ayni ekranda "tum bekleyen urunler" toplu dokumu (eksik stok uyarisiyla)
- [x] 3. Siparis formuna "Alinan ucret (kapora)"; odemede kapora etiketi
- [x] 4. Sevkiyat durak kartina "Teslim edildi" butonu (kalan her seyi teslim et, stoktan dus)
- [x] 5. Siparis formuna fatura bilgisi bolumu (unvan, VKN/TCKN, vergi dairesi, adres, fatura no/tarihi)
- [x] 6. Siparis listesinden "Taslak" filtresini kaldir
- [x] 7. Satir fiyati zorunlu degil; genel toplam elle yazilabilir

### Notlar

- **Elle yazilan toplam ayri sutunda** (`orders.manual_total_kurus`). Iskontoyla
  ifade edilemezdi: iskonto ara toplamdan buyuk olamaz, satirlar fiyatsizken ara
  toplam sifir kaliyor. Dolu oldugunda iskonto sifirlaniyor — ayni indirimi iki
  kere ifade etmemek icin. Musteriye giden kagitta birim/tutar sutunlari hic
  basilmiyor; bir sutun dolusu "0,00 TL" yerine tek toplam kaliyor.
- **Kapora taslak siparise eklenebilen tek odeme.** Musteri parayi siparisi
  verirken birakiyor, siparis o anda henuz onaylanmamis oluyor. Siradan tahsilat
  yasagi duruyor.
- **Fatura bilgisi siparisin anlik kopyasi**, musteri kartina bagli degil: ayni
  musteri bir siparisi sahsina, digerini sirketine kestirebiliyor. Kismi
  guncelleme: gonderilmeyen alan silinmiyor, yoksa fatura no girmek unvani
  silerdi.
- **"Teslim edildi" kalan her bileseni tek islemde teslim ediyor**; okuma ve
  yazma ayni transaction'da, arada baska teslimat girilirse iki kere dusmesin
  diye. Stok yetmiyorsa reddediyor ve kullaniciya soruyor.
- Bekleyen dokumunde serbest satirlarin eksik hesabi yapilmiyor: takip edilen
  bir stoklari yok.

## Plan 9 — Production gecisi (2026-09-16)

- [x] 1. Deneme verisi silindi, katalog korundu
- [x] 2. Parolalar yenilendi (sube 1, sube 2, yonetici)
- [x] 3. Giris ekranindan sube secimi kaldirildi
- [x] 4. Stok kilidi yonetici parolasina baglandi

### Sifirlama

Tek seferlik `scripts/go-live.ts` ile yapildi ve betik sonrasinda silindi.
Silinenler: 13 siparis, 22 satir, 30 bilesen, 7 teslimat, 17 teslimat satiri,
7 odeme, 4 mal kabul, 20 mal kabul satiri, 37 stok hareketi, 9 musteri,
3 tedarikci. Sayaclardan siparis/teslimat/mal kabul/musteri/tedarikci
sifirlandi; stok karti ve urun sayaclari korundu — kartlar duruyor ve
kodlari benzersiz olmali.

Korunanlar: 567 stok karti, 180 urun, receteler, 5 kategori, 4 satici,
subeler ve sistem ayarlari.

Sifirlananlar: kart adetleri, kart notlari, kart alis fiyatlari ve urun
varsayilan fiyatlari. Hepsi ornek veriden geliyordu; 134 adedin tamami demo
hareketlerindendi. Yedek: `backups/depo-2026-09-16T07-49-33-233Z.json`.

### Giris

Sube dugmeleri kalkti, tek parola alani kaldi. Parola hangi hesabinsa o hesap
aciliyor: once subeler, sonra yonetici denenir.

Kilitlenme sayaci artik tek. Parolayi kimin yazdigini bilmedigimiz icin hesap
basina sayac tutulamiyor; bes hatali denemeden sonra giris herkese kapaniyor.
Bu yuzden sure 15 degil 5 dakika — bir kisinin yanlis yazmasi artik herkesi
disarida biraktigi icin kilidin bedeli agirlasti.

Ayni parolanin iki hesapta kullanilmasi engellendi: parola artik hesabin tek
isareti, ayni olurlarsa birine bir daha girilemez.

### Kilitler

Stok ve raporlarin ikisi de yonetici parolasiyla aciliyor. Sube parolasi
ikisini de acmiyor — tarayicida denendi, reddedildi.

`scripts/set-password.ts` kaldi: parola unutuldugunda arayuzden cikis yok.

## Plan 10 — Otomatik yedek ve Excel ile sayim (2026-09-16)

- [x] 1. Gunluk otomatik yedek (Vercel Cron + Blob)
- [x] 2. Geri yukleme betigi
- [x] 3. Excel sayim sablonu: mevcut kartlar iner, adet sutunu doldurulup geri yuklenir

### Yedek

`/api/yedek` her gece 01:00 UTC'de (Istanbul 04:00) calisiyor ve veritabaninin
tamamini JSON olarak Blob deposuna yaziyor. Son 30 dosya saklaniyor.

Depo **private**: yedek musteri adi, telefon ve adresi iceriyor. Dosyanin
adresi tahmin edilemez olsun yetmez; token'siz istek 403 donuyor (denendi).

Uc nokta `CRON_SECRET` basligi istiyor ve **secret tanimli degilse istegi
reddediyor**. Acik birakmak, veritabaninin tamamini dokecek bir dugmeyi
internete koymak olurdu. Proxy'de muaf tutuldu — cron oturum cerezi tasimiyor,
kendi kapisi var.

Geri yukleme: `npm run db:restore <dosya> --onayliyorum`. Mevcut veriyi silip
yerine yedegi yaziyor, tek transaction. Bulut yedegi indirilip gercekten geri
yuklendi ve sonrasinda parolayla giris denendi — calisiyor.

`stock_movements.seq` gibi otomatik artan sutunlar acikca yazildigi icin
geri yuklemeden sonra sayac ileri aliniyor; yoksa bir sonraki hareket mevcut
bir seq'i alirdi.

### Excel sayim

Sablon bos degil, mevcut kartlarla dolu iniyor (SKU, ad, boyut, renk, mevcut
adet) — 567 kartin kodunu elle yazdirmanin alemi yok.

Bos birakilan satira dokunulmuyor, sifir yazmak karti sifirliyor: bos hucre
ile 0 ayri seyler.

Adet dogrudan yazilmiyor; her fark `stock_count` hareketi uretiyor, boylece
"bu adet nereden geldi" sorusu sonradan cevaplanabiliyor.

Tanimsiz SKU ya da kesirli adet varsa hicbir satir islenmiyor: yarim islenmis
bir sayim, hic sayilmamis olmaktan kotudur.

Toplu sayim da stok kilidine tabi — kilitliyken karttan tek tek
degistirilemeyen adet Excel'den topluca degistirilebilseydi kilidin anlami
kalmazdi. Tarayicida denendi, reddedildi.

## Duzeltme — siparisler yanlis subeye yaziliyordu (2026-09-16)

Sikayet: bir subede olusturulan siparis digerinde de gorunuyor.

Sebep sorgularda degil giriste. Alan fonksiyonlarinin hepsi subeye
suzuluyor (`branch-isolation.test.ts` capraz okuma/yazmanin tamamini
kapsiyor); sorun iki kullanicinin ayni hesaba girmesiydi.

Sube dugmeleri kalkinca hesabi parola belirler oldu. Giris ise ilk eslesen
hesabi aciyordu: iki sube ayni parolayi tasiyorsa (kontrol yazma tarafina
sonradan eklendi, daha once verilmis parolalar duruyor) herkes kod
sirasindaki ilk subeye — S1'e — giriyordu. Ikinci subenin siparisleri
birincinin defterine yaziliyor, iki sube ayni listeyi goruyordu.

- Giris artik butun hesaplari deniyor. Birden fazlasi eslesirse hicbiri
  acilmiyor; ekran ne yapilmasi gerektigini yaziyor. Sessizce yanlis hesaba
  girmek, girememekten kotudur.
- Cakisma hatali deneme sayilmiyor: parola dogru, kusur kurulumda. Sayac
  isletilseydi yonetici durumu duzeltmek icin iceri giremezdi.
- Parolasi olmayan sube yoneticinin ana sayfasinda uyari olarak duruyor.
  Girilemeyen sube demek, calisaninin baska bir parolayla girmesi demek —
  ayni karisiklik.
- Yeni siparis formu kaydin hangi sube adina yazilacagini basta soyluyor.
  Yonetici hesabina da "siparis olusturulamaz" notu eklendi; eskiden bu
  ancak kaydederken anlasiliyordu.

Kurulum tarafinda yapilmasi gereken: her subeye ayri parola
(Ayarlar > Subeler ya da `npx tsx scripts/set-password.ts S2 <parola>`).
Karisma donemindeki siparisler hala S1 defterinde; tasima araci yok.

### Teshis araci

Parolalar zaten ayriysa geriye tek ihtimal kaliyor: girilen hesap sanilan
hesap degil. Yonetici parolasiyla giren bir sube calisani butun subelerin
siparislerini gorur — sikayetin gorundugu bicim tam olarak bu.

`npx tsx scripts/hesaplar.ts [parola]` hesaplarin parolasi var mi, hangi
subenin defterinde kac siparis/musteri var ve verilen parola hangi hesabi
aciyor onu yaziyor. Arac giristeki `matchAccounts` fonksiyonunu kullaniyor;
ayri bir kopya olsaydi arac ile gercek davranis zamanla ayrilirdi.

Siparis listesi de yoneticiye "bu liste butun subelerin" diye yaziyor.
