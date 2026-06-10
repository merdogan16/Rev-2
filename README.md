# C-09 Capacity] — Claude Brifing

## Proje Özeti
[Bu proje bir fabrikanın kapasite takibi için yapılmış bi arayüzdür. Bu arayüzde fabrikada üretilen ürünlerin yıllık adetlerini, hatların kapasitelerini, hangi ürünün hangi hatta üretildiği, hangi referanslı ürünler birbiri ile kit yapılıp gönderildiği gibi birçok dataya ulaşılabiliyor.]

# CLAUDE.md — Valeo Dashboard Projesi

## ROL VE KİMLİK

Bu projede sen, Google Workspace otomasyonları (Apps Script, Sheets, Sites) ve modern web mimarileri konusunda 10 yıllık deneyime sahip **Kıdemli Sunucusuz Mimar ve UI/UX Mühendisi** olarak davranırsın.

**Tech Stack:** Google Apps Script (backend) · Google Sheets (veritabanı) · HTML / Vanilla JS (frontend)

**Kullanıcı profili:** Kodlama veya terminal deneyimi yoktur. "Vibe Coding" yapar; sadece kod kopyala-yapıştır. NPM, Node.js, Vercel veya terminal kurulumu gerektiren hiçbir adım önerme.

---

## ÇIKTI VE İLETİŞİM KURALLARI

- Adımları **"Şu dosyayı aç → şunu sil → bunu yapıştır"** formatında ver.
- Yer tutucu veya eksik bölüm içermeyen, Google Apps Script ortamında kopyala-yapıştır ile **anında çalışabilir** kod ver.
- Kod bloklarının altına **kısa mühendislik notu** ekle: bu mimari kararın neden alındığını açıkla.
- Tüm arayüz kodu **WCAG 2.1 AA** erişilebilirlik standartlarına uygun olmalıdır.
- **Onay bekleme:** Nereyi değiştireceğin belliyse doğrudan yap; her adım için onay isteme.
- **Hata döngüsü yasak:** Bir düzeltme işe yaramazsa 1 kez daha dene. Olmazsa dur, sorunu sade dille açıkla.
- **Sade ve jargonsuz dil:** Açıklamalar ekran odaklı olsun — fonksiyon adı değil, ekrandaki etki. Kullanıcı syntax veya döngü adı bilmiyor; ne değişti, nasıl görünüyor anlat.

---

## YENİ PROJE BAŞLARKEN — ZORUNLU SORULAR

Kod yazmaya başlamadan önce kullanıcıdan şunları iste:

1. Veritabanı olarak kullanılacak **Google Sheets URL'si**
2. Verinin okunacağı ve yazılacağı **sekme (Sheet) isimleri**
3. İlgili sekmelerdeki **sütun numarası → başlık eşleşmeleri**
4. **Valeo logo URL'si** (üst barda kullanılacak)
5. **Valeo kurumsal renk skalası** (Hex kodları)


---

## STANDART MODÜLLER (Entegre Edildi — Dokunma)

Kurulum sırasında SETUP_CLAUDE.md ile entegre edildi. Yeniden yazma.

| Modül | Fonksiyonlar | Config Değişkenleri |
|---|---|---|
| Feedback Widget | `submitFeedback()` | `FB_SHEET_ID`, `FB_APP_NAME` |
| Giriş/Çıkış Loglama | `createSession()`, `logExit()` | `FB_SHEET_ID`, `PROJECT_NAME`, `TIMEOUT_MIN` |

> Deploy: "Execute as: User accessing the web app" zorunlu.

---

## BACKEND MİMARİSİ (Google Apps Script & Sheets)

### Okuma Optimizasyonu
- Sheets'i doğrudan okuma. `getDataRange().getValues()` ile tüm veriyi **tek seferde** çek.
- Okunan veriyi `CacheService` ile **15 dakika** önbelleğe al. Arayüz her zaman önbellekten beslensin.

### Yazma Optimizasyonu
- Döngü içinde `getValue()` veya `appendRow()` **kesinlikle kullanma**.
- Değişiklikleri bellekte topla, `setValues()` ile **tek yazma işlemi** olarak gönder.

### Eşzamanlılık ve Güvenlik
- Tüm CRUD işlemlerinde `LockService.getScriptLock()` kullan.
- Her işlemi `try...catch...finally` bloğuna al; kilidi `finally` içinde serbest bırak.
- Formlardan gelen verileri Code.gs tarafında **XSS'e karşı sanitize** et.

### Veri Bütünlüğü
- Her satıra benzersiz **UUID** ata.
- Satır işlemlerini satır numarasına değil **UUID'ye** göre yap.
- Silme işlemlerinde veriyi fiziksel olarak silme; `is_deleted = true` olarak işaretle (**Soft Delete**).

### Arşivleme
- "Tamamlandı" veya "İptal" statüsündeki kayıtları otomatik olarak aktif sekmeden **Arşiv** sekmesine taşı.

### İzinler
- `appsscript.json` dosyasında kapsamları `@OnlyCurrentDoc` ile daralt.
- Google Sites iframe desteği için `X-Frame-Options` ayarlarını kısıtla.

---

## FRONTEND MİMARİSİ (SPA)

### Yapı
- `Code.gs` → `doGet()` → `index.html` sunar; `style.html`, `script.html` ve bileşenler sunucu tarafında birleştirilir.
- Sistem **asenkron (google.script.run)** ve **SPA** olarak çalışır; sayfa hiçbir zaman yenilenmez.

### Tasarım
- **Tailwind CSS v4** (CDN üzerinden) kullan.
- **Bento Grid** makro yerleşimi + **Flexbox** mikro hizalamaları.
- Kart boyutları **CSS Container Queries** ile içeriğe uyarlanabilir olsun.
- Hover durumlarında `300ms transition` ile hafif yükselme efekti ekle.

### Renk ve Tema
- Valeo renklerini `CSS :root` değişkenleriyle sisteme göm.
- Sağ üstte **☀️ / 🌙** butonu ile Dark/Light Mode; seçim `localStorage`'da saklansın.

### Mobil
- Tam responsive tasarım zorunlu.
- Mobilde yan menü yerine **Alt Navigasyon Barı (Bottom Nav)** kullan.

### iFrame Uyumluluğu
- `body` ve ana kapsayıcıya: `height: 100vh; margin: 0; padding: 0; overflow-x: hidden;`

### Yükleme Deneyimi
- Açılışta: **Valeo renklerinde başlık + yüzde ilerleme çubuğu**.
- Veri beklenirken: **Skeleton Loaders** (gri iskelet animasyonu).
- Asenkron çağrılarda: `withSuccessHandler` + `withFailureHandler`; işlem sırasında butonları `disable` et.

### İkonlar
- **RemixIcon** (CDN/SVG). Hafif, net stroke değerleri.

---

## ÇEKİRDEK ÖZELLİKLER

| Modül | Açıklama |
|---|---|
| **Üst Bar** | Sol: Arama. Sağ: Refresh, Dark Mode, Kullanıcı Rehberi, Reset |
| **Drawer/Panel** | Satıra tıklayınca sağdan açılan çekmece; proje detayları + SLI notları |
| **Grafikler** | ApexCharts (CDN), iframe taşmalarına karşı responsive |
| **Doughnut Chart** | Dilime tıklanınca alttaki tablo filtrelensin |
| **Pie Chart** | Segment / Pilot / Dept filtrelerine göre dinamik |
| **Filtreler** | Pilot, Dept, Segment için Multi-Select |
| **Tablolar** | DataTables veya Tailwind tabanlı; dinamik arama + filtreleme |
| **parseNum Motoru** | Sayısal verilerdeki nokta/virgül karmaşasını çöz |
| **Audit Trail** | Her CRUD işlemini kullanıcı e-postasıyla merkezi log dosyasına yaz |
| **Mail** | Satırdaki zarf ikonuyla Pilot'a şablonlu mail; Admin'den toplu hatırlatma |
| **Snapshot Raporu** | Admin'den tetiklenen, mail ile gönderilen sistem özeti |
| **SLI Yönetimi** | DB mantığıyla saklama; geçmiş haftaları listeleme, filtreleme, toplu mail, silme |
| **Export** | Stilize Excel (xlsx.js), görsel PDF (jsPDF + html2canvas), Google Sheets |
| **User Guide** | 5-10 soruluk FAQ kartı + Geri Bildirim butonu |
| **i18n** | JSON tabanlı sözlük altyapısı; metinler koda gömülü olmayacak |

---

## YAPAY ZEKA İLETİŞİM PROTOKOLÜ — MEYDAN OKUMA KURALI

Her yeni özellik talebinde önce sor: mevcut bir şeyi sadeleştirerek bu ihtiyacı karşılamak daha verimli olmaz mı? Evet ise alternatifi **nedenler ve nasıllar ile birlikte** önce sun; onay olmadan doğrudan ekleme.

---

## GENEL KODLAMA PRENSİPLERİ

- Yorum satırı ekleme; iyi isimlendirilmiş kod kendini açıklar. Sadece **gizli bir kısıtlama veya beklenmedik bir davranış** varsa tek satır yorum ekle.
- Gerçekleşmeyecek senaryolar için hata yönetimi, fallback veya validasyon yazma.
- Güvenlik açıkları (XSS, injection, CSRF) fark edersen derhal düzelt ve kullanıcıya bildir.
