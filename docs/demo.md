# Demo kopyası (depo.catalcamyazilim.online)

Aynı kod, ayrı bir Vercel projesinde ve ayrı bir veritabanıyla çalışır. Gerçek
işletmenin verisine hiçbir yoldan erişmez.

## Demoda neler farklı

| | Canlı sistem | Demo |
|---|---|---|
| Giriş | Şube parolası | "Merkez olarak gir" / "Şube 2 olarak gir" |
| Stok ve rapor kilidi | Kilit parolası | Kilit ekranında yazıyor (`demo1234`) |
| Belgeden oku | Dosya yüklenir, yapay zekâ okur | 3 hazır örnek; kayıtlı sonuç, yapay zekâya gidilmez |
| Excel'den içe aktarma | Açık | Kapalı (dışa aktarma açık) |
| Firma bilgisi, parolalar | Ayarlar'dan değişir | Kapalı |
| Gece yedeği (`/api/yedek`) | Her gece Blob'a | Kapalı (404) |
| TCMB kuru (`/api/kur`) | Açık | Açık; yalnızca demo veritabanına yazar |
| Veri | Gerçek | Uydurma; her gece 03:00'te (`/api/demo-sifirla`) baştan kurulur |

Bayrak `NEXT_PUBLIC_DEMO_MODE=1`. Tek başına yetki vermez: parolasız giriş ve
sıfırlama ayrıca veritabanının adının `depo_demo` olmasını ister. Bayrak
yanlışlıkla canlı projeye girse bile canlı veritabanında ikisi de çalışmaz.

`vercel.json` iki projede ortak. Canlı proje de `/api/demo-sifirla`'yı her gece
çağırır, bayrak olmadığı için 404 alır.

## Kurulum

1. **Neon:** ayrı bir proje açın (örneğin "depo-demo"), veritabanının adı
   `depo_demo` olsun. Canlı projeden branch açmayın: branch gerçek müşterileri
   de kopyalar.
2. **Vercel:** aynı GitHub reposundan ikinci bir proje. Ortam değişkenleri:
   - `NEXT_PUBLIC_DEMO_MODE=1`
   - `DATABASE_URL`: demo veritabanının adresi (`.../depo_demo?sslmode=require`)
   - `SESSION_SECRET`: yeni, en az 32 karakter
     (`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`)
   - `CRON_SECRET`: yeni
   - `OPENAI_API_KEY` ve `BLOB_READ_WRITE_TOKEN` **eklenmez**.
3. **Alan adı:** Vercel'de projeye `depo.catalcamyazilim.online` eklenir. DNS'te
   `depo` için `CNAME cname.vercel-dns.com`.
4. **Göçler ve ilk veri** (demo adresiyle, yerelden):

   ```bash
   DATABASE_URL="postgres://.../depo_demo?sslmode=require" npm run db:migrate
   DATABASE_URL="postgres://.../depo_demo?sslmode=require" npm run db:demo
   ```

   `db:demo` veritabanının adı `depo_demo` değilse hiçbir şeye dokunmadan durur.

## Örnek irsaliyeler

`public/demo/irsaliye/` altındaki fotoğraf, PDF ve Excel uydurma belgelerdir.
Sonuçları `src/domain/demo/receipt-samples.json` dosyasında. Her biri bir kez
gerçek okuyucuyla, demo kataloğu üzerinde okundu. Kayıt, kart kimliğini değil
kartın adını ve ölçüsünü tutar; okuma anında o geceki kartlara çevrilir.

Demo kataloğu (`src/domain/demo/seed.ts`) değişirse örnekler yeniden okunmalı.
