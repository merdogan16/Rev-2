# C-09 Capacity Dashboard

Valeo C-09 fabrikasının **kapasite ve komponent izleme panosu**. Bir planlamacının
normalde dört ayrı e-tabloyu açıp yüz sütunluk bir sayfada satır kovalayarak
cevapladığı soruyu tek ekranda cevaplar:

> "Bu kitin DMF'i hangi hatta üretiliyor ve o hat 2029'da kapasitesini aşıyor mu?"

**Tech Stack:** Google Apps Script (backend) · Google Sheets (veritabanı) ·
HTML / Vanilla JS / Tailwind CSS (frontend) · Chart.js (grafikler)

---

## Dosya yapısı

Proje **iki dosyadan** oluşur; ikisi de Apps Script düzenleyicisine doğrudan
kopyalanır. Depoda üçüncü dosya olarak yalnızca bu README bulunur.

| Dosya | Rol |
|---|---|
| `Code.gs` | Backend: veri okuma, sütun sözleşmesi doğrulaması, önbellek, hat yükü motoru, uyarı e-postaları, geri bildirim, oturum logu ve (dosyanın sonunda) elle çalıştırılan teşhis fonksiyonları |
| `Index.html` | Tüm arayüz: markup + derlenmiş Tailwind CSS + JS |
| `README.md` | Bu dosya |

---

## Veri kaynakları

Uygulama **salt-okunurdur**: kapasite, hat ve plan verisine hiçbir şey yazmaz.
Yazdığı tek şey geri bildirim kayıtları, oturum logları ve (yapılandırılmışsa)
plan arşividir.

| Kaynak | Sayfa | İçerik |
|---|---|---|
| `MAIN_SS_ID` | `MTP'27` | Ana ürün listesi: kit → komponentler → hatlar → 2027-2031 adetleri |
| `MAIN_SS_ID` | `Diaphragm Line` | Diyafram fırın eşlemesi |
| `MAIN_SS_ID` | `PFW` | DMF → PFW / Spring Guide / Drive Plate eşlemesi |
| `SUMMARY_SS_ID` | `MTP_summary` | Hat kapasiteleri: cycle time, TRP, vardiya/gün, yıllık kapasite |
| `EDRIVE_SS_ID` | `e-drive` | e-Drive referansları ve operasyon hatları |

### Sütun sözleşmesi — önemli

`MTP'27` sütunları **sabit indeksle değil, başlık satırı doğrulanarak** okunur
(`resolveMtpColumns`, `Code.gs`). Tabloya sütun eklendiğinde indeksler
kendiliğinden kayar. Beklenen başlıkların **hiçbiri** tanınmazsa uygulama yanlış
sayı göstermek yerine veri yüklemez ve açık bir hata gösterir.

Yeni bir alan eklerken `MTP_COLUMNS` sabitine hem varsayılan indeksi hem de
kabul edilen başlık adlarını yazın.

---

## Yapılandırma

Tüm kimlikler `Code.gs` içindeki `CONFIG` nesnesinde toplanmıştır. Değerler
**Script Properties**'te tanımlıysa oradan okunur (Uzantılar → Apps Script →
Proje ayarları → Komut dosyası özellikleri); tanımlı değilse koddaki varsayılan
kullanılır. Böylece test/canlı ayrımı ve devir teslim kod değiştirmeden yapılır.

| Anahtar | Açıklama |
|---|---|
| `MAIN_SS_ID`, `SUMMARY_SS_ID`, `EDRIVE_SS_ID` | Kaynak e-tablolar |
| `FB_SHEET_ID` | Geri bildirim + oturum logu + arama istatistiği e-tablosu |
| `LAYOUT_FOLDER_ID` | Hat layout görsellerinin bulunduğu Drive klasörü |
| `FEEDBACK_NOTIFY_EMAIL` | Geri bildirim bildirimi (virgülle çoklu; **Google Grubu önerilir**) |
| `ALERT_NOTIFY_EMAIL` | Kapasite aşımı uyarısı alıcıları |
| `LINE_DOCS_SHEET` | Hat → Drive doküman klasörü eşlemesinin tutulduğu sayfa adı |
| `ARCHIVE_SS_ID` | Plan arşivi e-tablosu (boşsa arşivleme yapılmaz) |
| `BACKUP_FOLDER_ID` | Günlük yedek klasörü (boşsa yedek alınmaz) |

---

## Kurulum

1. Üç kaynak e-tablonun kimliklerini `CONFIG`'e (ya da Script Properties'e) yazın.
2. **Dağıtım → Yeni dağıtım → Web uygulaması**
   - *Yürütme:* **Uygulamaya erişen kullanıcı**
   - *Erişim:* **Alan adındaki herkes**

   > Bu iki ayar güvenlik açısından belirleyicidir ve Apps Script arayüzünde tutulur,
   > kodda değil. "Yürütme: Ben" seçilirse uygulama, açan kişinin değil **sizin**
   > yetkinizle çalışır — her kullanıcı sizin erişebildiğiniz veriyi görür.
3. Apps Script düzenleyicisinde **`kurTetikleyiciler`** fonksiyonunu bir kez
   çalıştırın. Şu tetikleyiciler kurulur:

   | Fonksiyon | Sıklık | Ne yapar |
   |---|---|---|
   | `sendCapacityAlerts` | Haftalık (Pzt 07:00) | Kapasiteyi aşan hatları e-postayla bildirir |
   | `clearCache` | Saatlik | Önbelleği tazeler |
   | `backupSourceSpreadsheets` | Günlük (02:00) | Kaynak tabloları yedek klasörüne kopyalar |
   | `archivePlanSnapshot` | Aylık (ayın 1'i) | Hat yüklerinin anlık görüntüsünü arşive yazar |

4. İlk açılıştan sonra bir hat kartı açıp **grafiğin çizildiğini doğrulayın**
   (bkz. aşağıdaki "Dış betikler ve SRI").

---

## Ekranlar

| Ekran | Ne yapar |
|---|---|
| **Boş ekran** | Dört ürün kartı (PPCA / Disc / DMF / e-Drive) + doluluk renk efsanesi |
| **Kit detayı** | Bir kitin tüm komponentleri, hatları, kapasiteleri ve yıllık doluluğu |
| **Arama sonuçları** | Hat/komponent/müşteri/aile grubu araması; sıralama, "%100 üstü" filtresi, CSV indirme |
| **Darboğazlar** | Doluluğu %100'ü aşan tüm hatlar, en kritik yıla göre sıralı + CSV |
| **Senaryo (what-if)** | Vardiya/TRP değiştirerek kapasiteyi yeniden hesaplar (kaydetmez) |
| **Veri kalitesi** | Kapasitesi tanımsız hatlar, kullanılmayan hatlar, çift kayıtlı kitler |
| **Yardım** | 9 soruluk kullanım rehberi |
| **Hat layout** | Hat başına Drive'daki layout görseli (yakınlaştırma/kaydırma) |

Görünümler `location.hash`'te taşınır: bağlantı paylaşılabilir, yer imine
eklenebilir ve tarayıcının geri tuşu çalışır (`#kit=…`, `#ara=…`, `#darbogaz`,
`#kalite`, `#yardim`).

---

## Hesaplama kuralları

**Doluluk = yıllık adet ÷ yıllık kapasite × 100**

| Durum | Davranış |
|---|---|
| Kapasite tanımlı | Yeşil ≤%100 · Sarı %101-114 · Kırmızı ≥%115 |
| **Kapasite tanımsız** | Doluluk **hesaplanmaz**; hücre kesikli gri, "kapasite yok" yazar. **Asla %0 gösterilmez** — "veri yok" ile "hat boş" karıştırılmaz. |
| Kapasite sabit yedek satırdan okundu | "tahmini" rozeti gösterilir |
| Aynı DMF birden çok PFW/SG/DP hattına gidiyor | Adet hatlara **eşit bölünür** ve kartta rozetle belirtilir — bu bir varsayımdır, ölçüm değildir |
| Kit birden çok satırda | Adetler toplanır, komponentler satırlardan birleştirilir; "N kayıt toplamı" notu gösterilir |

Hat adları tek bir kanonik anahtarla eşleştirilir (`canonicalLineKey`): baştaki
`VD03` gibi istasyon kodu atılır, alfasayısal olmayan karakterler silinir.
Backend ve frontend **aynı** kuralı kullanır.

---

## Geliştirme kuralları

- **Yorum satırı:** yalnızca gizli bir kısıtlama ya da beklenmedik bir davranış
  varsa. İyi isimlendirilmiş kod kendini açıklar.
- **Okuma:** Sheets'ten döngü içinde hücre okumayın; `getDataRange().getValues()`
  ile tek seferde çekin. Sonuç `CacheService`'te 15 dakika parçalı olarak tutulur.
- **Yazma:** `appendRow` döngüsü kullanmayın; `LockService` + `try/finally`
  zorunludur.
- **Hata yönetimi:** boş `catch` bloğu yazmayın. Hatayı `Logger`'a yazın **ve**
  `warnings[]` üzerinden arayüze taşıyın — sessiz başarısızlık, yanlış sayıdan
  daha tehlikelidir.
- **Erişilebilirlik:** WCAG 2.1 AA. Odak halkalarını (`focus-visible`)
  kaldırmayın; metin rengi olarak `valeo-greenText` kullanın; yeni modal açarsanız
  odak tuzağı ve odak geri yükleme ekleyin.
- **Güvenlik:** kullanıcı/tablo kaynaklı hiçbir metni `innerHTML`'e kaçışsız
  koymayın (`escapeHtml`). Sunucu tarafı doğrulama, istemci doğrulamasının
  aynısını yapmalıdır. Ham istisna metnini kullanıcıya göstermeyin.
- **Doğrulama:** depoda otomatik test yok. Değişiklikten sonra en az şunları elle
  kontrol edin: (a) kapasitesi tanımlı bir hat yüzde gösteriyor mu, (b) kapasitesi
  tanımsız bir hat "kapasite yok" yazıyor mu (**asla %0 değil**), (c) grafikler
  çiziliyor mu, (d) dil değiştirince hiçbir yerde boş metin kalıyor mu.

---

## Dış betikler ve SRI

`Index.html` iki dış betik yükler ve ikisi de `integrity` (Subresource Integrity)
karmasıyla doğrulanır — CDN ele geçirilir ya da dosya değişirse tarayıcı betiği
**çalıştırmaz**.

| Betik | Sürüm | SRI |
|---|---|---|
| `chart.umd.js` | Chart.js 4.4.4 | `sha384-G436+Z2nlA8+PNoeRvWdxKbvOf8E/y+lYxqht2iBwNHTQDV5CJr3+AGVj8fGZi5t` |
| `chartjs-plugin-datalabels.min.js` | 2.2.0 | `sha384-y49Zu59jZHJL/PLKgZPv3k2WI9c0Yp3pWB76V8OBVCb0QBKS8l4Ff3YslzHVX76Y` |

> **İlk dağıtımdan sonra kontrol edin:** bir hat kartı açıp grafiğin çizildiğini
> doğrulayın. Grafik görünmüyorsa ve tarayıcı konsolunda bir `integrity` hatası
> varsa karma o dosyayla eşleşmiyor demektir. Bu durumda **uygulamanın geri kalanı
> çalışmaya devam eder** — `chartsAvailable()` kütüphane yoksa grafikleri atlar,
> sayılar ve doluluk ızgaraları yine görünür.

Sürüm yükseltirseniz karmayı da yenileyin; eski karma yeni dosyayla eşleşmez ve
betik sessizce çalışmaz hale gelir.

## Tailwind CSS

`Index.html` içindeki `<style id="tw">…</style>` bloğu **önceden derlenmiş**
Tailwind çıktısıdır. Eskiden `cdn.tailwindcss.com` (Play CDN) yükleniyordu; o
yaklaşım tarayıcıya bir CSS derleyicisi indirip stilleri her açılışta yeniden
üretiyor ve ilk boyamayı geciktiriyordu.

**Var olan sınıfları kullandığınız sürece yeniden derlemeye gerek yok.** Yalnızca
`Index.html`'e **yeni bir Tailwind sınıfı** eklerseniz gerekir.

> Sınıf adlarını asla parça parça birleştirmeyin (`'text-' + renk` gibi) —
> Tailwind tarayıcısı bunları göremez ve stil üretilmez. Sınıf adı kaynakta
> **tam** geçmelidir.

Yeniden derlemek gerekirse (Node.js ister, panoyu kullanan kişinin yapması
beklenmez):

```
npx tailwindcss@3.4.17 -i input.css -o out.css --minify
```

`input.css` içeriği `@tailwind base; @tailwind components; @tailwind utilities;`
ve yapılandırma şu renk token'larını tanımlar:

| Token | Değer | Kullanım |
|---|---|---|
| `valeo-green` | `#89c341` | Yüzey/vurgu rengi ve **karanlık temada** metin |
| `valeo-greenText` | `#4d8c10` | **Açık temada metin** — beyaz üzerinde 4,6:1 kontrast |
| `valeo-blue` | `#0072b5` | İkincil vurgu, odak halkası |
| `valeo-cardInner` | `#e6f0f5` | Kart iç yüzeyi |
| `valeo-cardBorder` | `#d0e0ea` | Kart kenarlığı |

`#89c341` beyaz üzerinde yalnızca **2,11:1** kontrast verir; WCAG AA normal metin
için 4,5:1 ister. Bu yüzden metin rengi olarak `valeo-greenText` kullanılır,
`valeo-green` yüzey/vurgu için kalır.

## Bilinen sınırlar

- **Zaman granülerliği yıllıktır** (2027-2031). Kaynak veride aylık kırılım
  olmadığı için bir hattın çeyrek bazlı tepe yükü görünmez.
- **Rol tabanlı görünürlük yoktur.** Web app'e erişebilen herkes tüm müşteri ve
  hacim verisini görür; erişim kontrolü tamamen dağıtım ayarına dayanır.
- **Kapasite modeli tek sayıdır.** Setup/changeover, OEE ve planlı bakım duruşu
  modele dahil değildir; senaryo ekranı yalnızca vardiya/TRP/çalışma günü
  değişkenlerini hesaba katar.
- **ERP entegrasyonu yoktur.** Kaynak e-tablonun nasıl doldurulduğu sistemin
  görüş alanı dışındadır.
- **Otomatik test ve CI yoktur.** Proje bilinçli olarak iki dosyada tutuluyor
  (Apps Script'e kopyala-yapıştır ile kurulduğu için), bu yüzden hesap
  mantığındaki bir değişiklik yalnızca elle doğrulanabilir. Doğrulama listesi
  için yukarıdaki "Geliştirme kuralları" bölümüne bakın.
- **Giriş logu kişisel veri içerir** (çalışan e-postası + oturum süresi).
  KVKK/GDPR gereği saklama süresi ve aydınlatma metni tanımlanmalıdır; bu veri
  bugün yalnızca `getUsageStats` ile toplulaştırılmış olarak okunur.
