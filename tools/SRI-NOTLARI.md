# CDN betikleri ve SRI karmaları

`Index.html` iki dış betik yükler ve her ikisi de `integrity` (Subresource
Integrity) karmasıyla doğrulanır. CDN ele geçirilir ya da dosya değiştirilirse
tarayıcı betiği **çalıştırmaz**.

| Betik | Sürüm | SRI |
|---|---|---|
| `chart.umd.js` | Chart.js 4.4.4 | `sha384-G436+Z2nlA8+PNoeRvWdxKbvOf8E/y+lYxqht2iBwNHTQDV5CJr3+AGVj8fGZi5t` |
| `chartjs-plugin-datalabels.min.js` | 2.2.0 | `sha384-y49Zu59jZHJL/PLKgZPv3k2WI9c0Yp3pWB76V8OBVCb0QBKS8l4Ff3YslzHVX76Y` |

## Karmalar nasıl üretildi?

npm paketinin içindeki dosyalardan hesaplandı (jsDelivr, npm dosyalarını birebir
sunar):

```
npm install chart.js@4.4.4 chartjs-plugin-datalabels@2.2.0
openssl dgst -sha384 -binary node_modules/chart.js/dist/chart.umd.js | openssl base64 -A
openssl dgst -sha384 -binary node_modules/chartjs-plugin-datalabels/dist/chartjs-plugin-datalabels.min.js | openssl base64 -A
```

> **İlk dağıtımdan sonra kontrol edin:** bir hat kartı açıp grafiğin çizildiğini
> doğrulayın. Grafik görünmüyorsa ve tarayıcı konsolunda bir `integrity` hatası
> varsa, karma o dosyayla eşleşmiyor demektir — yukarıdaki komutla yeniden
> üretip `Index.html`'deki değeri güncelleyin.
>
> Grafik çizilmese bile **uygulamanın geri kalanı çalışmaya devam eder**:
> `chartsAvailable()` kütüphane yoksa grafikleri atlar, sayılar ve doluluk
> ızgaraları yine görünür.

## Sürüm yükseltirken

Sürümü değiştirdiğinizde karmayı da mutlaka yenileyin; eski karma yeni dosyayla
eşleşmez ve betik sessizce çalışmaz hale gelir.
