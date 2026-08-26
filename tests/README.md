# Testler

`Code.gs`'in saf hesap fonksiyonlarını (sütun sözleşmesi doğrulaması, hat yükü
toplulaştırma, darboğaz tespiti, veri kalitesi denetimi, DMF/PFW çözümlemesi)
Apps Script'e ihtiyaç duymadan doğrular. Google servisleri (SpreadsheetApp,
DriveApp, CacheService…) sahte nesnelerle değiştirilir.

**Bu testleri çalıştırmak için Apps Script'e ihtiyaç yok** — ama Node.js gerekir,
yani panoyu kullanan kişinin bunu çalıştırması beklenmiyor. Testler, kodda
değişiklik yapan geliştirici içindir (ya da ileride bir CI kurulursa onun için).

```
node tests/backend.test.js
```

Çıktı her kontrol için `ok` / `FAIL` satırı ve sonda özet verir; bir test
başarısız olursa çıkış kodu 1'dir.

## Neden bunlar test ediliyor?

Bu dosyadaki her test, denetimde bulunan somut bir hatayı bir daha geri gelmemesi
için sabitliyor:

| Test | Sabitlediği davranış |
|---|---|
| `resolveMtpColumns` | Kaynak tabloya sütun eklenirse indeksler kendiliğinden kayar; başlık hiç bulunamazsa veri **gösterilmez** |
| `computeLineLoads` | Kapasite tanımsızsa doluluk `null` olur — **asla %0 değil** |
| `computeLineLoads` (PFW) | Adet birden çok hatta eşit bölünür ve `split` bayrağıyla işaretlenir |
| `findOverloadedLines` | Kapasitesi tanımsız hat darboğaz listesine girmez |
| `auditDataQuality` | Kapasitesi olmayan hatlar ve çift kayıtlı kitler tespit edilir |
| `readDmfPfwStats` | Sabit yedek bloktan gelen değer `estimated: true` ile işaretlenir |
