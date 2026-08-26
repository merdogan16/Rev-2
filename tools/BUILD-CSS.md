# Tailwind CSS'i yeniden derleme

`Index.html` içindeki `<style id="tw">…</style>` bloğu **önceden derlenmiş** Tailwind
çıktısıdır. Eskiden bunun yerine `cdn.tailwindcss.com` (Play CDN) yükleniyordu; o
yaklaşım tarayıcıya bir CSS derleyicisi indirip stilleri her açılışta yeniden
üretiyordu ve Tailwind'in kendi dokümantasyonunda üretim için önerilmiyor.

## Ne zaman yeniden derlemek gerekir?

Yalnızca `Index.html`'e **yeni bir Tailwind sınıfı** eklediğinizde. Var olan
sınıfları kullanmaya devam ediyorsanız derlemeye gerek yok.

> Sınıf adlarını asla parça parça birleştirmeyin (`'text-' + renk` gibi) —
> Tailwind tarayıcısı bunları göremez ve stil üretilmez. Sınıf adı kaynakta
> **tam** geçmelidir.

## Nasıl derlenir?

Bu adımı panoyu kullanan kişinin yapması beklenmiyor; kodu değiştiren geliştirici
içindir ve Node.js gerektirir.

```
cd tools
npm install tailwindcss@3.4.17
npx tailwindcss -c tailwind.config.js -i tailwind-input.css -o out.css --minify
```

Sonra `out.css` içeriğini `Index.html`'deki `<style id="tw">` etiketinin içine
(eski içeriğin yerine) yapıştırın.

## Renk token'ları

`tailwind.config.js` içinde tanımlıdır:

| Token | Değer | Kullanım |
|---|---|---|
| `valeo-green` | `#89c341` | Yüzey/vurgu rengi ve **karanlık temada** metin |
| `valeo-greenText` | `#4d8c10` | **Açık temada metin** — beyaz üzerinde 4,6:1 kontrast |
| `valeo-blue` | `#0072b5` | İkincil vurgu, odak halkası |
| `valeo-cardInner` | `#e6f0f5` | Kart iç yüzeyi |
| `valeo-cardBorder` | `#d0e0ea` | Kart kenarlığı |

`#89c341` beyaz üzerinde yalnızca **2,11:1** kontrast verir; WCAG AA normal metin
için 4,5:1, büyük metin için 3:1 ister. Bu yüzden **metin rengi olarak
`valeo-greenText` kullanılır**, `valeo-green` yüzey/vurgu için kalır.
