// ─── Yapılandırma ─────────────────────────────────────────────────────────────
// Tüm dosya/klasör kimlikleri tek nesnede. Değerler Script Properties'te tanımlıysa
// (Uzantılar → Apps Script → Proje ayarları → Komut dosyası özellikleri) oradan okunur;
// tanımlı değilse aşağıdaki varsayılan kullanılır. Böylece test/canlı ortam ayrımı ve
// devir teslim, kod değiştirmeden yapılabilir.
var CONFIG = (function () {
  var defaults = {
    PROJECT_NAME:          'Capacity_C09',
    TIMEOUT_MIN:           10,
    FB_SHEET_ID:           '1dT55ZmEYScXA-BLpWDimuBtTzGZi13Qn0mAdbc2iWyM',
    // Birden çok alıcı virgülle yazılabilir. Tek kişiye bağımlılığı bitirmek için
    // buraya bir Google Grubu adresi konması önerilir (bkz. README).
    FEEDBACK_NOTIFY_EMAIL: 'mustafa.erdogan@valeo.com',
    // Kapasite aşımı uyarı e-postasının alıcıları. Boşsa uyarı gönderilmez.
    ALERT_NOTIFY_EMAIL:    'mustafa.erdogan@valeo.com',
    MAIN_SS_ID:            '1SpLc32ad9K7HEMUWdMDNMxIRkKe73qaK0Pxw4SZvARk',
    SUMMARY_SS_ID:         '1Lx2IniscO0hfdnZi12chv24dooB_pePJtUjKolB97C0',
    EDRIVE_SS_ID:          '1pdPtUMFP8TYK8YCeEzIrSOZxL-Km7FzJBY5CXfLAU14',
    LAYOUT_FOLDER_ID:      '1X2jhb_li2c-WxKBld8p3GHUeZMwuOR_H',
    EDRIVE_IMG_FILE_ID:    '1diFZjZq6mWHjzxp07VjD-DuXcoNq54Uy',
    // Hat → Drive doküman klasörü eşlemesinin tutulduğu sayfa (FB_SHEET_ID içinde).
    // Sayfa yoksa Index.html'deki gömülü liste kullanılır.
    LINE_DOCS_SHEET:       'HatDokumanlari',
    // Yıllık plan arşivinin yazıldığı e-tablo (boşsa arşivleme yapılmaz).
    ARCHIVE_SS_ID:         '',
    // Günlük yedeklerin kopyalanacağı Drive klasörü (boşsa yedek alınmaz).
    BACKUP_FOLDER_ID:      ''
  };
  var out = {};
  var stored = {};
  try { stored = PropertiesService.getScriptProperties().getProperties() || {}; } catch (e) { stored = {}; }
  Object.keys(defaults).forEach(function (k) {
    var v = stored[k];
    out[k] = (v === undefined || v === null || v === '') ? defaults[k] : v;
  });
  out.TIMEOUT_MIN = Number(out.TIMEOUT_MIN) || defaults.TIMEOUT_MIN;
  return out;
})();

// Geriye dönük uyumluluk: eski kod bu adları doğrudan kullanıyordu.
var PROJECT_NAME          = CONFIG.PROJECT_NAME;
var LOG_SHEET             = PROJECT_NAME + '_GirisLoglari';
var SEARCH_LOG_SHEET      = PROJECT_NAME + '_AramaIstatistigi';
var TIMEOUT_MIN           = CONFIG.TIMEOUT_MIN;
var FB_SHEET_ID           = CONFIG.FB_SHEET_ID;
var FEEDBACK_NOTIFY_EMAIL = CONFIG.FEEDBACK_NOTIFY_EMAIL;
var MAIN_SS_ID            = CONFIG.MAIN_SS_ID;
var SUMMARY_SS_ID         = CONFIG.SUMMARY_SS_ID;
var EDRIVE_SS_ID          = CONFIG.EDRIVE_SS_ID;
var LAYOUT_FOLDER_ID      = CONFIG.LAYOUT_FOLDER_ID;
var EDRIVE_IMG_FILE_ID    = CONFIG.EDRIVE_IMG_FILE_ID;

// MTP'27 sütun sözleşmesi: alan adı → beklenen başlık(lar) + varsayılan sütun indeksi (0 tabanlı).
// getSpreadsheetData açılışta başlık satırını okuyup bu eşlemeyi DOĞRULAR; başlık bulunursa
// gerçek indeks kullanılır, bulunamazsa varsayılana düşülür ve uyarı üretilir. Böylece
// kaynak tabloya sütun eklendiğinde sayılar sessizce kaymaz.
var MTP_HEADER_ROW = 7;   // başlıkların bulunduğu satır (veri 8'den başlıyor)
var MTP_COLUMNS = {
  customer:        { col: 5,  names: ['customer', 'musteri', 'müşteri'] },
  customerName:    { col: 6,  names: ['customer name', 'musteri tanimi', 'müşteri tanımı', 'customer description'] },
  customerCountry: { col: 12, names: ['country', 'ulke', 'ülke', 'customer country'] },
  ppcaLine:        { col: 26, names: ['ppca line', 'ppca hat', 'ppca hatti', 'ppca hattı'] },
  ppca:            { col: 27, names: ['ppca', 'ppca ref'] },
  familyGroup:     { col: 28, names: ['family group', 'aile grubu', 'ppca family group'] },
  diskLine:        { col: 29, names: ['disc line', 'disk line', 'disk hat', 'disc hat'] },
  disk:            { col: 30, names: ['disc', 'disk', 'disc ref', 'disk ref'] },
  diskFamilyGroup: { col: 31, names: ['disc family group', 'disk family group', 'disk aile grubu'] },
  dmfLine:         { col: 32, names: ['dmf line', 'dmf hat', 'dmf hatti', 'dmf hattı'] },
  dmf:             { col: 33, names: ['dmf', 'dmf ref'] },
  diaphragm:       { col: 36, names: ['diaphragm', 'diyafram'] },
  cover:           { col: 37, names: ['cover', 'kapak'] },
  coverLine:       { col: 38, names: ['cover line', 'kapak hat', 'cover hat'] },
  kit:             { col: 40, names: ['kit', 'kit ref', 'kit referans', 'kit referansi', 'kit referansı'] },
  vol26:           { col: 82, names: ['2027'] },
  vol27:           { col: 83, names: ['2028'] },
  vol28:           { col: 84, names: ['2029'] },
  vol29:           { col: 85, names: ['2030'] },
  vol30:           { col: 86, names: ['2031'] }
};
// Okunacak sütun sayısı: sözleşmedeki en büyük indeks + güvenlik payı.
// (Eskiden sabit 100 sütun okunuyordu; kullanılan alan ~20 sütun.)
var MTP_READ_WIDTH = 92;

// Önbellek anahtarı sütun sözleşmesinden türetilir: sözleşme değişince önbellek
// kendiliğinden geçersizleşir, elle "v35 → v36" yazmaya gerek kalmaz.
var CACHE_KEY = 'spreadsheet_data_' + _schemaFingerprint();
var CACHE_TTL_SEC   = 900;   // 15 dakika
var CACHE_CHUNK_MAX = 90000; // CacheService değer sınırı ~100 KB; parça başına güvenli üst sınır
var CACHE_MAX_CHUNKS = 12;   // ~1 MB'a kadar veri önbelleklenebilir

function _schemaFingerprint() {
  var keys = Object.keys(MTP_COLUMNS).sort();
  // 'rev2': sabit sütun okumasına geçiş — eski (otomatik remap'lenmiş) önbelleği geçersiz kılar
  var sig = 'rev2|' + keys.map(function (k) { return k + ':' + MTP_COLUMNS[k].col; }).join('|');
  var h = 0;
  for (var i = 0; i < sig.length; i++) { h = ((h << 5) - h + sig.charCodeAt(i)) | 0; }
  return 'v' + Math.abs(h).toString(36);
}

// MTP_summary'de e-Drive hat bloğunun beklenen ilk satırı (4 satır okunur);
// blok kaymışsa (satır eklendi/silindi) hat adlarıyla tüm sayfa taranır
var EDRIVE_STATS_ROW      = 97;
// MTP_summary'de DMF/PFW yedek blokları (isimle bulunamazsa): DMF 50-53, PFW 54-57.
// Bu yoldan gelen değerler estimated:true ile işaretlenir ve arayüzde "tahmini" rozeti alır.
var DMF_FALLBACK_ROW      = 50;
var PFW_FALLBACK_ROW      = 54;

// Doluluk renk eşikleri — arayüzdeki eşiklerle aynı kaynaktan beslenir.
var OCCUPANCY_WARN_PCT = 101;
var OCCUPANCY_CRIT_PCT = 115;

// ─── Ortak yardımcılar ────────────────────────────────────────────────────────

// Sheets/Drive çağrıları geçici olarak başarısız olabilir (kota, ağ). Üstel geri
// çekilmeli yeniden deneme: 2s, 4s, 8s. Son deneme de başarısızsa hata yukarı atılır.
function withRetry(label, fn, attempts) {
  var max = attempts || 3;
  var lastErr = null;
  for (var i = 0; i < max; i++) {
    try {
      return fn();
    } catch (e) {
      lastErr = e;
      if (i < max - 1) Utilities.sleep(2000 * Math.pow(2, i));
    }
  }
  throw new Error(label + ' başarısız (' + max + ' deneme): ' + (lastErr && lastErr.message ? lastErr.message : lastErr));
}

// Yutulan hataların gideceği yer. Sessiz catch yerine buraya yazılır ve
// toplanan uyarılar arayüze taşınır (kullanıcı "veri eksik" olduğunu görür).
function _warn(bag, code, err) {
  var msg = (err && err.message) ? err.message : String(err || '');
  try { Logger.log('UYARI [' + code + '] ' + msg); } catch (e) {}
  if (bag && bag.push) bag.push({ code: code, detail: msg });
  return bag;
}

function doGet() {
  var session  = createSession();
  var template = HtmlService.createTemplateFromFile('Index');
  template.sessionId  = session.sessionId;
  template.userEmail  = session.email;
  template.timeoutMin = TIMEOUT_MIN;
  var execUrl = '';
  try { execUrl = ScriptApp.getService().getUrl() || ''; } catch (e) { execUrl = ''; }
  template.execUrl = execUrl;
  return template.evaluate()
    .setTitle('C09 Capacity Dashboard')
    // Google Sites gömmesi için iframe'e izin veriliyor. Apps Script bu ayarda
    // kaynak listesi kabul etmiyor (ALLOWALL / SAMEORIGIN dışında seçenek yok);
    // gömme ihtiyacı sürdüğü sürece bu değer zorunlu. Buna karşılık doPost artık
    // oturum sahipliği doğruladığı için forge edilmiş istek log yazamıyor.
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

// Çıkış kaydı: sayfa kapanırken tarayıcının sendBeacon isteği buraya düşer
// (google.script.run kapanış sırasında çoğu zaman iptal edildiği için).
// Oturumun gerçekten çağıranın kendi oturumu olduğu doğrulanır — aksi halde
// herkes keyfi sessionId ve süre göndererek denetim logunu bozabilirdi.
function doPost(e) {
  try {
    var p = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (p.action === 'logExit' && p.sessionId) {
      logExit(String(p.sessionId), Number(p.exitTimestamp) || Date.now(), Number(p.durationSec) || 0);
    }
  } catch (err) {
    Logger.log('doPost hatası: ' + err);
  }
  return ContentService.createTextOutput('ok');
}

function getEDriveImage() {
  return getLayoutImage(EDRIVE_IMG_FILE_ID);
}

// ─── Feedback Widget ───────────────────────────────────────────────────────────

var FB_IMAGE_MAX_BYTES = 5 * 1024 * 1024;   // istemcideki sınırın sunucu tarafı karşılığı
var FB_MESSAGE_MAX_LEN = 4000;

function submitFeedback(payload) {
  payload = payload || {};
  var lock = LockService.getScriptLock();
  try { lock.waitLock(10000); } catch (e) {
    return { success: false, code: 'BUSY' };
  }
  try {
    return _submitFeedbackLocked(payload);
  } finally {
    lock.releaseLock();
  }
}

function _submitFeedbackLocked(payload) {
  var ss = SpreadsheetApp.openById(FB_SHEET_ID);
  // Sekme adı ARTIK istemciden alınmıyor: eskiden payload.appName ile herhangi bir
  // kullanıcı e-tabloda keyfi adlarla sınırsız sekme açtırabiliyordu (ASVS V5).
  var tabName = PROJECT_NAME;
  var sheet   = ss.getSheetByName(tabName);

  if (!sheet) {
    sheet = ss.insertSheet(tabName);
    sheet.getRange(1, 1, 1, 10).setValues([[
      'FeedbackID','Email','Feedback_Type','Priority','Message',
      'CreatedAt','Comments','Status','Standardization Y/N','Ekran Görüntüsü'
    ]]).setBackground('#4A6CF7').setFontColor('#FFFFFF').setFontWeight('bold');
    sheet.setFrozenRows(1);
    sheet.setColumnWidth(1, 110); sheet.setColumnWidth(2, 200);
    sheet.setColumnWidth(3, 120); sheet.setColumnWidth(4, 90);
    sheet.setColumnWidth(5, 320); sheet.setColumnWidth(6, 160);
    sheet.setColumnWidth(7, 200); sheet.setColumnWidth(10, 240);
  } else if (sheet.getLastColumn() < 10) {
    sheet.getRange(1, 10).setValue('Ekran Görüntüsü')
      .setBackground('#4A6CF7').setFontColor('#FFFFFF').setFontWeight('bold');
    sheet.setColumnWidth(10, 240);
  }

  var id    = Utilities.getUuid().substring(0, 8).toUpperCase();
  var now   = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
  var email = Session.getActiveUser().getEmail();

  var message = String(payload.message || '').slice(0, FB_MESSAGE_MAX_LEN);
  var attachmentUrl = _saveFeedbackImage(id, payload.image);

  sheet.appendRow([id, email,
    String(payload.feedbackType || '').slice(0, 40),
    String(payload.priority || '').slice(0, 40),
    message, now, '', 'Open', '', attachmentUrl]);

  _notifyFeedbackByEmail(id, email, { feedbackType: payload.feedbackType, priority: payload.priority, message: message }, now, attachmentUrl);

  return { success: true, id: id };
}

function _notifyFeedbackByEmail(id, email, payload, now, attachmentUrl) {
  try {
    var subject = '[C09 Capacity] Yeni Geri Bildirim — ' + id;
    var lines = [
      'Yeni bir geri bildirim alındı.',
      '',
      'Geri Bildirim ID: ' + id,
      'Gönderen: ' + email,
      'Tür: ' + (payload.feedbackType || '-'),
      'Öncelik: ' + (payload.priority || '-'),
      'Tarih: ' + now,
      '',
      'Mesaj:',
      payload.message || '-'
    ];
    if (attachmentUrl) {
      lines.push('');
      lines.push('Ekran Görüntüsü: ' + attachmentUrl);
    }
    var to = _recipients(CONFIG.FEEDBACK_NOTIFY_EMAIL);
    if (!to) return;
    MailApp.sendEmail({ to: to, subject: subject, body: lines.join('\n') });
  } catch (e) {
    // E-posta gönderimi başarısız olsa da geri bildirim kaydı tamamlanmış olur
    Logger.log('Geri bildirim e-postası gönderilemedi: ' + e);
  }
}

// Virgülle ayrılmış alıcı listesini normalize eder (tek kişiye bağımlılığı
// bitirmek için CONFIG'e Google Grubu adresi yazılabilir).
function _recipients(raw) {
  return String(raw || '')
    .split(',')
    .map(function (x) { return x.trim(); })
    .filter(function (x) { return x.indexOf('@') > 0; })
    .join(',');
}

function _saveFeedbackImage(feedbackId, image) {
  if (!image || !image.data || !image.mimeType) return '';
  var allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
  if (allowedTypes.indexOf(image.mimeType) === -1) return '';

  var base64Data = String(image.data).split(',').pop();
  // Boyut sınırı SUNUCUDA da uygulanıyor: eskiden yalnızca istemcide kontrol
  // ediliyordu, doğrudan google.script.run çağrısıyla atlatılabilirdi (ASVS V5).
  if (base64Data.length * 3 / 4 > FB_IMAGE_MAX_BYTES) {
    Logger.log('Geri bildirim görseli boyut sınırını aştı, atlandı: ' + feedbackId);
    return '';
  }

  try {
    var folderName = PROJECT_NAME + '_GeriBildirimGorselleri';
    var folders = DriveApp.getFoldersByName(folderName);
    var folder  = folders.hasNext() ? folders.next() : DriveApp.createFolder(folderName);

    var safeName = String(image.fileName || 'ekran-goruntusu').replace(/[^\w.\-]/g, '_').slice(0, 80);
    var blob     = Utilities.newBlob(Utilities.base64Decode(base64Data), image.mimeType, feedbackId + '_' + safeName);
    var file     = folder.createFile(blob);
    // Şirket dışına açılmasın: yalnızca domain içi link paylaşımı; domain yoksa dosya özel kalır
    try {
      file.setSharing(DriveApp.Access.DOMAIN_WITH_LINK, DriveApp.Permission.VIEW);
    } catch (e) {
      Logger.log('Görsel paylaşım ayarı uygulanamadı (dosya özel kaldı): ' + e);
    }
    return file.getUrl();
  } catch (e) {
    Logger.log('Geri bildirim görseli kaydedilemedi: ' + e);
    return '';
  }
}

// ─── Giriş/Çıkış Loglama ──────────────────────────────────────────────────────
// FB_SHEET_ID / PROJECT_NAME / LOG_SHEET / TIMEOUT_MIN dosyanın başındaki
// yapılandırma bloğunda tanımlıdır.

function createSession() {
  var sessionId = Utilities.getUuid();
  var email     = Session.getActiveUser().getEmail() || 'Anonim';
  var lock = LockService.getScriptLock();
  // Eskiden kilitsizdi: aynı anda açılan iki oturum log sayfasında yarışabiliyordu.
  try { lock.waitLock(10000); } catch (e) {
    Logger.log('createSession kilidi alınamadı, log yazılmadı: ' + e);
    return { sessionId: sessionId, email: email };
  }
  try {
    _getOrCreateLogSheet().appendRow([sessionId, email, new Date(), '', '', 'Açık']);
  } catch (e) {
    Logger.log('Oturum kaydı yazılamadı: ' + e);
  } finally {
    lock.releaseLock();
  }
  return { sessionId: sessionId, email: email };
}

// Çıkış kaydı. Yalnızca ÇAĞIRANIN KENDİ açık oturumu güncellenebilir: sessionId
// ile eşleşen satırın e-posta sütunu çağıranla aynı değilse istek reddedilir.
// (Eskiden herkes keyfi sessionId + süre gönderip denetim logunu bozabiliyordu.)
function logExit(sessionId, exitTimestamp, durationSec) {
  var caller = '';
  try { caller = Session.getActiveUser().getEmail() || 'Anonim'; } catch (e) { caller = 'Anonim'; }

  var lock = LockService.getScriptLock();
  try { lock.waitLock(3000); } catch (e) {
    Logger.log('logExit kilidi alınamadı: ' + e);
    return { ok: false, code: 'BUSY' };
  }
  try {
    var sheet = _getOrCreateLogSheet();
    // Oturum ID benzersiz (UUID); tüm sayfayı okumak yerine TextFinder ile bulunur
    var finder = sheet.createTextFinder(String(sessionId)).matchEntireCell(true);
    var cell = finder.findNext();
    while (cell) {
      var row = cell.getRow();
      if (cell.getColumn() === 1 && row > 1) {
        var rowVals = sheet.getRange(row, 1, 1, 6).getValues()[0];
        var owner   = String(rowVals[1] || '');
        var status  = rowVals[5];
        if (owner !== caller) {
          Logger.log('logExit reddedildi: oturum sahibi değil (' + caller + ')');
          return { ok: false, code: 'FORBIDDEN' };
        }
        // Idempotency: zaten kapatılmış oturum ikinci kez yazılmaz
        // (sendBeacon + pagehide aynı isteği iki kez gönderebiliyor).
        if (status !== 'Açık') return { ok: true, code: 'ALREADY_CLOSED' };
        sheet.getRange(row, 4).setValue(new Date(exitTimestamp));
        sheet.getRange(row, 5).setValue(Math.round(durationSec / 60 * 10) / 10);
        sheet.getRange(row, 6).setValue('Tamamlandı');
        return { ok: true };
      }
      cell = finder.findNext();
    }
    return { ok: false, code: 'NOT_FOUND' };
  } catch (e) {
    Logger.log('logExit hatası: ' + e);
    return { ok: false, code: 'ERROR' };
  } finally {
    lock.releaseLock();
  }
}

function _getOrCreateLogSheet() {
  var ss    = SpreadsheetApp.openById(FB_SHEET_ID);
  var sheet = ss.getSheetByName(LOG_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(LOG_SHEET);
    sheet.appendRow(['Oturum ID', 'E-posta', 'Giriş Zamanı', 'Çıkış Zamanı', 'Süre (dk)', 'Durum']);
    sheet.getRange(1, 1, 1, 6).setFontWeight('bold');
  }
  return sheet;
}

function getLayoutMap() {
  try {
    var map = _allowedLayoutFiles();
    return { ok: true, map: map };
  } catch (e) {
    Logger.log('getLayoutMap hatası: ' + e);
    // Ham istisna metni istemciye gönderilmez (iç yol/kimlik sızdırmamak için).
    return { ok: false, code: 'DRIVE_ACCESS', map: {} };
  }
}

// Layout klasöründeki dosyalar: normalize hat adı → dosya kimliği.
// Hem getLayoutMap hem de getLayoutImage'ın yetki kontrolü bu tek kaynaktan beslenir.
function _allowedLayoutFiles() {
  var folder = withRetry('Layout klasörü', function () { return DriveApp.getFolderById(LAYOUT_FOLDER_ID); });
  var files = folder.getFiles();
  var map = {};
  while (files.hasNext()) {
    var file = files.next();
    var rawName = file.getName().replace(/\.(jpg|jpeg|png|gif|bmp|webp|pdf)$/i, '');
    var key = rawName.replace(/[^A-Z0-9]/gi, '').toUpperCase();
    map[key] = file.getId();
  }
  return map;
}

// Yalnızca layout klasöründeki dosyalar ve e-Drive ürün görseli okunabilir.
// Bu kontrol olmadan istemci HERHANGİ bir Drive dosya kimliğini gönderip
// içeriğini base64 olarak alabiliyordu (OWASP A01 — Broken Access Control).
function _isAllowedImageId(fileId) {
  var id = String(fileId || '');
  if (!id) return false;
  if (id === EDRIVE_IMG_FILE_ID) return true;
  var cache = CacheService.getScriptCache();
  var key = 'layout_ids_' + LAYOUT_FOLDER_ID;
  var ids = null;
  try {
    var cached = cache.get(key);
    if (cached) ids = JSON.parse(cached);
  } catch (e) {
    Logger.log('Layout kimlik önbelleği okunamadı: ' + e);
  }
  if (!ids) {
    var map = _allowedLayoutFiles();
    ids = Object.keys(map).map(function (k) { return map[k]; });
    try { cache.put(key, JSON.stringify(ids), 600); } catch (e) { Logger.log('Layout kimlik önbelleği yazılamadı: ' + e); }
  }
  return ids.indexOf(id) !== -1;
}

function getLayoutImage(fileId) {
  try {
    if (!_isAllowedImageId(fileId)) {
      Logger.log('İzinsiz görsel isteği reddedildi: ' + fileId);
      return { ok: false, code: 'NOT_ALLOWED' };
    }
    var file = withRetry('Layout görseli', function () { return DriveApp.getFileById(fileId); });
    var blob = file.getBlob();
    var bytes = blob.getBytes();
    return {
      ok: true,
      dataUrl: 'data:' + blob.getContentType() + ';base64,' + Utilities.base64Encode(bytes)
    };
  } catch (e) {
    Logger.log('getLayoutImage hatası: ' + e);
    return { ok: false, code: 'IMAGE_READ' };
  }
}

// ─── Önbellek: parçalı yazma ──────────────────────────────────────────────────
// CacheService'in tek değer sınırı ~100 KB. Eskiden 90.000 karakteri aşan veri
// HİÇ önbelleklenmiyordu (yalnızca Logger'a uyarı yazılıyordu, kimse görmüyordu)
// ve her sayfa açılışı üç e-tabloyu baştan okuyordu. Artık veri parçalara bölünüp
// yazılıyor; yine de sığmazsa bu durum arayüze uyarı olarak taşınıyor.
function _cachePut(cache, key, text) {
  var chunks = [];
  for (var i = 0; i < text.length; i += CACHE_CHUNK_MAX) chunks.push(text.slice(i, i + CACHE_CHUNK_MAX));
  if (chunks.length > CACHE_MAX_CHUNKS) return false;
  var payload = {};
  for (var c = 0; c < chunks.length; c++) payload[key + '_c' + c] = chunks[c];
  payload[key + '_meta'] = JSON.stringify({ n: chunks.length, at: Date.now() });
  cache.putAll(payload, CACHE_TTL_SEC);
  return true;
}

function _cacheGet(cache, key) {
  var meta = cache.get(key + '_meta');
  if (!meta) return null;
  var n = 0, at = 0;
  try { var m = JSON.parse(meta); n = m.n; at = m.at; } catch (e) { return null; }
  var wanted = [];
  for (var i = 0; i < n; i++) wanted.push(key + '_c' + i);
  var got = cache.getAll(wanted);
  var parts = [];
  for (var j = 0; j < n; j++) {
    var piece = got[key + '_c' + j];
    if (piece === undefined || piece === null) return null;  // parça düşmüş, önbellek geçersiz
    parts.push(piece);
  }
  return { text: parts.join(''), at: at };
}

function clearCache() {
  var cache = CacheService.getScriptCache();
  var keys = [CACHE_KEY + '_meta'];
  for (var i = 0; i < CACHE_MAX_CHUNKS; i++) keys.push(CACHE_KEY + '_c' + i);
  keys.push('layout_ids_' + LAYOUT_FOLDER_ID);
  cache.removeAll(keys);
  Logger.log('Cache temizlendi. Bir sonraki web app isteği sheet\'ten taze veri okuyacak.');
  return { ok: true };
}

function getSpreadsheetData() {
  const cache = CacheService.getScriptCache();
  const hit = _cacheGet(cache, CACHE_KEY);
  if (hit) {
    try {
      const result = JSON.parse(hit.text);
      result.readAt = hit.at;
      result.fromCache = true;
      return result;
    } catch (e) {
      Logger.log('Önbellek çözülemedi, taze okumaya geçiliyor: ' + e);
    }
  }

  const warnings = [];
  try {
    const mainSs = withRetry('Ana e-tablo', function () { return SpreadsheetApp.openById(MAIN_SS_ID); });
    const summarySs = withRetry('Özet e-tablo', function () { return SpreadsheetApp.openById(SUMMARY_SS_ID); });

    const mtpSheet = mainSs.getSheetByName("MTP'27");
    const diagSheet = mainSs.getSheetByName('Diaphragm Line');
    const summarySheet = summarySs.getSheetByName('MTP_summary');

    if (!mtpSheet || !diagSheet || !summarySheet) {
      throw new Error("Gerekli sekmelerden biri bulunamadı.");
    }

    // Sütun indeksleri: sözleşmedeki sabit varsayılanlar. Otomatik başlık-tespiti
    // KALDIRILDI: yıl başlıkları (2027..2031) gibi tabloda birden çok yerde geçen
    // metinler yanlış sütuna eşleşip hem hatalı "sütun kaymış" uyarısı üretiyor
    // hem de yanlış sütundan okuma riski taşıyordu. Bu indeksler uzun süredir
    // doğru çalışıyor; kaynak tablonun sütun düzeni değişmediği sürece geçerli.
    const C = {};
    Object.keys(MTP_COLUMNS).forEach(function (f) { C[f] = MTP_COLUMNS[f].col; });
    
    // 1. HAT BAZLI KAPASİTE VERİLERİ (TÜM BOŞLUKLARI SİLEREK VE BÜYÜK HARFLE EŞLE)
    // 17 sütun okunur (A-Q): 4b'deki e-Drive bloğu da aynı okumayı kullanır (M-Q adetleri için)
    const summaryLastRow = Math.max(summarySheet.getLastRow(), 2);
    const summaryRaw = summarySheet.getRange(2, 1, summaryLastRow - 1, 17).getValues();
    const lineStatsMap = {};
    
    summaryRaw.forEach((row, idx) => {
      const rawName = String(row[2] || row[1] || '');
      const fullKey = rawName.replace(/[^A-Z0-9]/gi, '').toUpperCase();
      const stripKey = normLineName(rawName);
      if (fullKey) {
        // capacity yoksa 0 DEĞİL null taşınır: arayüz "kapasite tanımsız" ile
        // "kapasite sıfır"ı ayırt edebilsin (eskiden ikisi de %0 yeşil görünüyordu).
        const capRaw = row[10];
        const capNum = Number(capRaw);
        const val = {
          lineName: rawName,
          cycleTime: row[3] || '-',
          trp: row[4] || '-',
          shiftDay: row[5] || '-',
          annualCapacity: (capRaw === '' || capRaw === null || capRaw === undefined || isNaN(capNum) || capNum <= 0) ? null : capNum,
          // İzlenebilirlik: bu sayı hangi hücreden geldi?
          source: "MTP_summary!K" + (idx + 2)
        };
        lineStatsMap[fullKey] = val;
        if (stripKey && stripKey !== fullKey) lineStatsMap[stripKey] = val;
      }
    });

    // DMF/PFW de diğer hatlar gibi isimle okunur; isimle bulunamazsa eski sabit satırlara (50-53/54-57) düşer
    Object.assign(lineStatsMap, readDmfPfwStats(summarySheet, summaryRaw));

    // 2. DIAPHRAGM FIRIN VERİLERİ
    const diagLastRow = Math.max(diagSheet.getLastRow(), 1);
    const diagRaw = diagSheet.getRange(1, 1, diagLastRow, 9).getValues();
    const diagMap = {};
    
    for(let r = 0; r < diagRaw.length; r++) {
      const row = diagRaw[r];
      const baseDiagId = String(row[0] || '').trim().toUpperCase();
      if (baseDiagId) {
        const activeData = [];
        for (let c = 1; c <= 8; c++) {
          if (row[c] && String(row[c]).trim() !== '') activeData.push(String(row[c]).trim());
        }
        diagMap[baseDiagId] = activeData;  // dizi olarak sakla
      }
    }
    
    // 3. PFW SHEET → DMF ref → PFW/SpringGuide/DrivePlate haritası
    // Aynı DMF birden çok PFW hattına gidebilir; tekil alanlar (SG / DP) son satırı tutar,
    // pfwLines tüm farklı PFW hatlarını (adet bölmek için), pfwPairs ise tüm farklı
    // PFW referans+hat çiftlerini (kit kartında hepsini göstermek için) biriktirir.
    const pfwSheet = mainSs.getSheetByName('PFW');
    const pfwMap = {};
    if (pfwSheet) {
      const pfwLastRow = Math.max(pfwSheet.getLastRow(), 1);
      const pfwRaw = pfwSheet.getRange(1, 1, pfwLastRow, 9).getValues();
      pfwRaw.forEach(row => {
        const dmfRef = String(row[1] || '').trim();  // B sütunu: DMF referansı
        const pfwRef = String(row[3] || '').trim();  // D sütunu: PFW referansı
        if (!dmfRef || !pfwRef) return;
        const key = dmfRef.toUpperCase();
        if (!pfwMap[key]) {
          pfwMap[key] = { pfw: '', pfwLine: '', springGuide: '', springGuideLine: '',
                          drivePlate: '', drivePlateLine: '', pfwLines: [], pfwPairs: [],
                          sgLines: [], sgPairs: [], dpLines: [], dpPairs: [] };
        }
        const e = pfwMap[key];
        e.pfw             = pfwRef;
        e.pfwLine         = String(row[4] || '').trim();  // E
        e.springGuide     = String(row[5] || '').trim();  // F
        e.springGuideLine = String(row[6] || '').trim();  // G
        e.drivePlate      = String(row[7] || '').trim();  // H
        e.drivePlateLine  = String(row[8] || '').trim();  // I
        // Spring Guide / Drive Plate de PFW gibi çoklu satır destekli: aynı DMF
        // birden çok satırda geçtiğinde eskiden SON satır kazanıyor, öncekiler
        // sessizce kayboluyordu. Artık hepsi biriktiriliyor.
        [['sg', e.springGuide, e.springGuideLine], ['dp', e.drivePlate, e.drivePlateLine]].forEach(function (t) {
          const kind = t[0], ref = t[1], line = t[2];
          if (!ref) return;
          const lines = e[kind + 'Lines'], pairs = e[kind + 'Pairs'];
          if (line && !lines.some(x => normLineName(x) === normLineName(line))) lines.push(line);
          if (!pairs.some(x => x.ref === ref && normLineName(x.line) === normLineName(line))) pairs.push({ ref: ref, line: line });
        });
        const pl = e.pfwLine;
        if (pl && !e.pfwLines.some(x => normLineName(x) === normLineName(pl))) e.pfwLines.push(pl);
        if (!e.pfwPairs.some(x => x.ref === pfwRef && normLineName(x.line) === normLineName(pl)))
          e.pfwPairs.push({ ref: pfwRef, line: pl });
      });
    }

    // 4. E-DRIVE: ayrı dosyada "e-drive" sayfası → A=referans (A2+), B=hat/operasyon (B2+)
    //    Referanslar taban no + operasyon ekiyle gelir (örn. 75237B, 75237H, 75237IS).
    //    Aynı taban no, bir e-Drive parçasının tüm operasyon hatlarını temsil eder.
    const eDriveData = [];
    const eDriveRefSet = {};       // TAM ref (büyük harf) -> true  (MAIN O sütunu ile eşleştirme)
    const eDriveBaseToLines = {};  // taban no -> [ham hat adları]
    try {
      const eDriveSheet = SpreadsheetApp.openById(EDRIVE_SS_ID).getSheetByName('e-drive');
      if (eDriveSheet) {
        const eDriveLastRow = eDriveSheet.getLastRow();
        if (eDriveLastRow >= 2) {
          eDriveSheet.getRange(2, 1, eDriveLastRow - 1, 2).getValues().forEach(row => {
            const ref  = String(row[0] || '').trim();  // A
            const line = String(row[1] || '').trim();  // B
            if (!ref) return;
            const refUp = ref.toUpperCase();
            eDriveRefSet[refUp] = true;
            if (!line) return;
            eDriveData.push({ line, ref });
            const base = (refUp.match(/^[0-9]+/) || [''])[0];
            if (!base) return;
            if (!eDriveBaseToLines[base]) eDriveBaseToLines[base] = [];
            if (!eDriveBaseToLines[base].some(x => normLineName(x) === normLineName(line)))
              eDriveBaseToLines[base].push(line);
          });
        }
      }
    } catch(e) { _warn(warnings, 'EDRIVE_READ', e); }

    // 4b. E-DRIVE hat verileri (MTP_summary): C=hat, D=CT, E=TRP, F=vardiya, K=kapasite, M-Q=2027-2031 adet
    //     Önce beklenen blok (EDRIVE_STATS_ROW..+3, şu an 97-100) okunur ve e-drive sayfasındaki hat
    //     adlarıyla doğrulanır; blok kaymışsa (sheet'e satır eklendi/silindi) tüm sayfa isimle taranır.
    const eDriveLineStats = {};
    try {
      const eDriveLineKeys = {};
      eDriveData.forEach(function(e) { const k = normLineName(e.line); if (k) eDriveLineKeys[k] = true; });
      const rowToStats = function(r) {
        const lineName = String(r[2] || '').trim();   // C
        const key = normLineName(lineName);
        if (!key) return;
        eDriveLineStats[key] = {
          lineName:       lineName,
          cycleTime:      r[3]  || '-',           // D
          trp:            r[4]  || '-',           // E
          shiftDay:       r[5]  || '-',           // F
          annualCapacity: (function () { var n = Number(r[10]); return (r[10] === '' || r[10] === null || r[10] === undefined || isNaN(n) || n <= 0) ? null : n; })(),  // K
          source:         'MTP_summary!K',
          v26: Number(r[12]) || 0,   // M — 2027
          v27: Number(r[13]) || 0,   // N — 2028
          v28: Number(r[14]) || 0,   // O — 2029
          v29: Number(r[15]) || 0,   // P — 2030
          v30: Number(r[16]) || 0    // Q — 2031
        };
      };
      // summaryRaw 2. satırdan başlar → sheet satırı N = summaryRaw[N-2]
      const blockRows = summaryRaw.slice(EDRIVE_STATS_ROW - 2, EDRIVE_STATS_ROW + 2);
      const hasAnyKey = Object.keys(eDriveLineKeys).length > 0;
      const blockValid = !hasAnyKey || blockRows.some(function(r) { return eDriveLineKeys[normLineName(r[2])]; });
      if (blockValid) {
        blockRows.forEach(rowToStats);
      } else {
        summaryRaw.forEach(function(r) {
          const k = normLineName(r[2]);
          if (eDriveLineKeys[k] && !eDriveLineStats[k]) rowToStats(r);
        });
      }
    } catch(e) { _warn(warnings, 'EDRIVE_STATS', e); }

    // Kapasite kartı OLAN e-Drive hatları (summary sırasıyla normalize anahtarlar)
    const eDriveCardOrder = Object.keys(eDriveLineStats);

    // 5. ANA MTP VERİLERİ
    // Sütun indeksleri artık sabit değil, doğrulanmış sözleşmeden (C) geliyor.
    // Okuma genişliği de 100'den gerçek ihtiyaca indirildi.
    const mtpLastRow = Math.max(mtpSheet.getLastRow(), 8);
    const mtpWidth = Math.min(Math.max(mtpSheet.getLastColumn(), 1), Math.max(
      MTP_READ_WIDTH,
      Object.keys(C).reduce(function (m, k) { return Math.max(m, C[k] + 1); }, 0)
    ));
    const mtpRaw = mtpSheet.getRange(8, 1, mtpLastRow - 7, mtpWidth).getValues();

    const formattedData = mtpRaw.map(row => {
      const rawDiaphragm = String(row[C.diaphragm] || '').trim();
      let diagFurnaceInfo = '-';
      let diagLines = [];
      if (rawDiaphragm) {
        const upperDiag = rawDiaphragm.toUpperCase();
        if (upperDiag.endsWith('C')) {
          diagFurnaceInfo = 'Satınalma Komponent';
        } else if (upperDiag.endsWith('Y')) {
          const baseId = upperDiag.slice(0, -1);
          diagLines = diagMap[baseId] || [];
          diagFurnaceInfo = diagLines.length > 0 ? diagLines.join(', ') : '-';
        } else {
          diagLines = diagMap[upperDiag] || [];
          diagFurnaceInfo = diagLines.length > 0 ? diagLines.join(', ') : '-';
        }
      }

      const kitRef = String(row[C.kit] || '').trim();
      // E-Drive: kit O-ref'i e-drive dosyasında varsa, parçanın taban no'su üzerinden
      // tüm operasyon hatları bulunur; yalnızca kapasite kartı OLAN hatlar
      // (eDriveLineStats, bkz. 4b) summary sırasıyla nest edilmek üzere diziye konur.
      let eDriveLines = [];
      const kitUp = kitRef.toUpperCase();
      if (eDriveRefSet[kitUp]) {
        const base = (kitUp.match(/^[0-9]+/) || [''])[0];
        const ops = base ? (eDriveBaseToLines[base] || []) : [];
        if (ops.length) {
          eDriveLines = eDriveCardOrder
            .filter(k => ops.some(op => normLineName(op) === k))
            .map(k => eDriveLineStats[k].lineName);
        }
      }

      return {
        kit: kitRef,
        ppca: String(row[C.ppca] || '').trim(),
        ppcaLine: String(row[C.ppcaLine] || '').trim(),
        cover: String(row[C.cover] || '').trim(),
        coverLine: String(row[C.coverLine] || '').trim(),
        diaphragm: rawDiaphragm,
        diaphragmFurnace: diagFurnaceInfo,
        diaphragmLines: diagLines,
        disk: String(row[C.disk] || '').trim(),
        diskLine: String(row[C.diskLine] || '').trim(),
        diskFamilyGroup: String(row[C.diskFamilyGroup] || '').trim(),
        dmf: String(row[C.dmf] || '').trim(),
        dmfLine: String(row[C.dmfLine] || '').trim(),
        eDriveLines: eDriveLines,
        familyGroup: String(row[C.familyGroup] || '').trim(),
        customer: String(row[C.customer]  || '').trim(),
        customerName: String(row[C.customerName]  || '').trim(),
        customerCountry: String(row[C.customerCountry] || '').trim(),
        customerFlag: countryFlagUrl(row[C.customerCountry]),
        vol26: Number(row[C.vol26]) || 0,   // 2027
        vol27: Number(row[C.vol27]) || 0,   // 2028
        vol28: Number(row[C.vol28]) || 0,   // 2029
        vol29: Number(row[C.vol29]) || 0,   // 2030
        vol30: Number(row[C.vol30]) || 0    // 2031
      };
    }).filter(item => item.kit !== '');

    // Veri kalitesi kontrolü: ürünlerin atıfta bulunduğu her hattın kapasite satırı var mı?
    const quality = auditDataQuality(formattedData, lineStatsMap, eDriveLineStats);
    if (quality.linesWithoutCapacity.length) {
      warnings.push({
        code: 'CAPACITY_MISSING',
        detail: quality.linesWithoutCapacity.length + ' hattın kapasitesi tanımsız'
      });
    }

    const result = {
      globalData: formattedData,
      lineStats: lineStatsMap,
      eDriveData: eDriveData,
      eDriveLineStats: eDriveLineStats,
      pfwMap: pfwMap,
      lineDocs: readLineDocsMap(warnings),
      quality: quality,
      thresholds: { warn: OCCUPANCY_WARN_PCT, crit: OCCUPANCY_CRIT_PCT },
      warnings: warnings,
      readAt: Date.now(),
      fromCache: false
    };

    try {
      const serialized = JSON.stringify(result);
      if (!_cachePut(cache, CACHE_KEY, serialized)) {
        // Parçalı yazma bile yetmedi: bu durum artık sessiz değil, arayüzde görünür.
        warnings.push({ code: 'CACHE_SKIPPED', detail: serialized.length + ' karakter' });
        result.warnings = warnings;
        Logger.log('UYARI: Veri ' + serialized.length + ' karakter, parçalı önbellek sınırını aştı.');
      }
    } catch (e) {
      _warn(warnings, 'CACHE_WRITE', e);
      result.warnings = warnings;
    }

    return result;

  } catch (error) {
    Logger.log('getSpreadsheetData hatası: ' + error);
    return {
      error: 'LOAD_FAILED',
      message: 'Veri okunamadı. Kaynak tablolara erişim veya geçici bir servis hatası olabilir.',
      warnings: warnings
    };
  }
}

// ─── Veri kalitesi ────────────────────────────────────────────────────────────
// Ürünlerde geçen hatlar ile kapasite tablosundaki hatların küme farkını çıkarır.
// Bu kontrol eskiden hiçbir yerde yoktu: eksik kapasite sessizce 0'a dönüşüp
// arayüzde "%0 doluluk" (yeşil) olarak görünüyordu.
function auditDataQuality(rows, lineStatsMap, eDriveLineStats) {
  var referenced = {};   // normalize anahtar -> ham ad
  var addLine = function (raw, type) {
    var name = String(raw || '').trim();
    if (!name || name === '-') return;
    var k = normLineName(name);
    if (!k) return;
    if (!referenced[k]) referenced[k] = { name: name, types: {} };
    referenced[k].types[type] = true;
  };

  var kitCounts = {};
  rows.forEach(function (r) {
    addLine(r.ppcaLine, 'PPCA');
    addLine(r.diskLine, 'Disc');
    addLine(r.dmfLine, 'DMF');
    kitCounts[r.kit] = (kitCounts[r.kit] || 0) + 1;
  });

  var hasCapacity = function (k) {
    var a = lineStatsMap[k], b = eDriveLineStats[k];
    if (a && a.annualCapacity) return true;
    if (b && b.annualCapacity) return true;
    return false;
  };

  var linesWithoutCapacity = [];
  Object.keys(referenced).forEach(function (k) {
    if (!hasCapacity(k)) {
      linesWithoutCapacity.push({ key: k, name: referenced[k].name, types: Object.keys(referenced[k].types).join(', ') });
    }
  });
  linesWithoutCapacity.sort(function (a, b) { return a.name.localeCompare(b.name); });

  // Kapasite tablosunda olup hiçbir üründe geçmeyen hatlar (ölü kayıt işareti)
  var unusedLines = [];
  Object.keys(lineStatsMap).forEach(function (k) {
    if (!referenced[k] && lineStatsMap[k] && lineStatsMap[k].annualCapacity) {
      unusedLines.push({ key: k, name: lineStatsMap[k].lineName || k });
    }
  });

  var duplicateKits = Object.keys(kitCounts)
    .filter(function (k) { return kitCounts[k] > 1; })
    .map(function (k) { return { kit: k, rows: kitCounts[k] }; })
    .sort(function (a, b) { return b.rows - a.rows; });

  return {
    linesWithoutCapacity: linesWithoutCapacity,
    unusedLines: unusedLines.slice(0, 50),
    duplicateKits: duplicateKits.slice(0, 100),
    duplicateKitTotal: duplicateKits.length,
    totalLines: Object.keys(referenced).length,
    totalRows: rows.length
  };
}

// Hat → Drive doküman klasörü eşlemesi. Önce yapılandırılmış sayfadan okunur
// (yeni hat eklemek kod değişikliği gerektirmesin); sayfa yoksa boş döner ve
// Index.html'deki gömülü liste devreye girer.
function readLineDocsMap(warnings) {
  var map = {};
  try {
    var sheet = SpreadsheetApp.openById(FB_SHEET_ID).getSheetByName(CONFIG.LINE_DOCS_SHEET);
    if (!sheet) return map;
    var last = sheet.getLastRow();
    if (last < 2) return map;
    sheet.getRange(2, 1, last - 1, 2).getValues().forEach(function (r) {
      var name = String(r[0] || '').trim();
      var url  = String(r[1] || '').trim();
      if (!name || !/^https:\/\/(drive|docs)\.google\.com\//.test(url)) return;
      map[name.replace(/[^A-Z0-9]/gi, '').toUpperCase()] = url;
    });
  } catch (e) {
    _warn(warnings, 'LINE_DOCS', e);
  }
  return map;
}

// Hat adını normalize eder; baştaki "VD03 " gibi istasyon kodunu atar (MTP_summary'de isimler "VD03 DMF1" formatında)
function normLineName(raw) {
  return String(raw || '').replace(/^\s*VD\s*\d+\s*/i, '').replace(/[^A-Z0-9]/gi, '').toUpperCase();
}

// DMF/PFW hat istatistikleri: önce isimle (DMF1-4 / PFW1-4), bulunamazsa sabit yedek
// bloklardan (DMF_FALLBACK_ROW=50-53 / PFW_FALLBACK_ROW=54-57). preRead verilirse
// (getSpreadsheetData tam okuma yaptıysa) sheet tekrar okunmaz.
// İsim eşleşmesi TOLERANSLI: "DMF2" hem tam "DMF2" satırını hem de "DMF2 Kavrama"
// gibi ekli satırları yakalar (ardından rakam gelmediği sürece — "DMF20" ile karışmaz).
// Birden çok aday varsa kapasitesi (K) dolu olan seçilir; sonraki satırlar öncekini
// EZMEZ (stray referans satırları gerçek kapasite satırını bozmaz). Böylece DMF/PFW
// satırlarının adı ekli olduğunda ya da yeri kaydığında yanlış değer gelmez.
function readDmfPfwStats(sheet, preRead) {
  const stats = {};
  if (!sheet) return stats;
  const fixedLineNames = [['DMF1','DMF2','DMF3','DMF4'], ['PFW1','PFW2','PFW3','PFW4']];
  const targetKeys = ['DMF1','DMF2','DMF3','DMF4','PFW1','PFW2','PFW3','PFW4'];
  try {
    const data = preRead || sheet.getRange(2, 1, Math.max(sheet.getLastRow(), 2) - 1, 14).getValues();
    targetKeys.forEach(function(tk) {
      let best = null;
      for (let i = 0; i < data.length; i++) {
        const row = data[i];
        const k = normLineName(row[2]);
        // tam eşleşme ya da "tk" ile başlayıp devamı rakam olmayan (DMF2 ✓ DMF2X ✓ DMF20 ✗)
        if (k === tk || (k.indexOf(tk) === 0 && !/^[0-9]/.test(k.charAt(tk.length)))) {
          const capNum = Number(row[10]);
          const cap = (row[10] === '' || row[10] === null || row[10] === undefined || isNaN(capNum) || capNum <= 0) ? null : capNum;
          const cand = {
            lineName: String(row[2] || tk).trim(),
            cycleTime: row[3] || '-', trp: row[4] || '-', shiftDay: row[5] || '-',
            annualCapacity: cap,
            source: 'MTP_summary!K' + (i + 2)
          };
          if (cap) { best = cand; break; }  // kapasiteli satır kesin doğru → dur
          if (!best) best = cand;           // kapasitesiz ise ilk adayı tut
        }
      }
      if (best) stats[tk] = best;
    });
  } catch(e) { Logger.log('readDmfPfwStats isim taraması hatası: ' + e); }

  // Sabit yedek bloklar: yalnızca isimle HİÇ bulunamayan anahtarlar için.
  // Buradan gelen değer estimated:true ile işaretlenir — arayüz "tahmini" rozeti
  // gösterir, böylece koordinat tabanlı okuma gerçek veri gibi sunulmaz.
  [DMF_FALLBACK_ROW, PFW_FALLBACK_ROW].forEach(function(startRow, gi) {
    try {
      sheet.getRange(startRow, 4, 4, 8).getValues().forEach(function(r, i) {
        const key = fixedLineNames[gi][i];
        if (!stats[key]) {
          const capNum = Number(r[7]);
          stats[key] = {
            lineName:       key,
            cycleTime:      r[0] || '-',
            trp:            r[1] || '-',
            shiftDay:       r[2] || '-',
            annualCapacity: (isNaN(capNum) || capNum <= 0) ? null : capNum,
            estimated:      true,
            source:         'MTP_summary satır ' + (startRow + i) + ' (sabit yedek)'
          };
        }
      });
    } catch(e) { Logger.log('readDmfPfwStats yedek blok hatası (' + startRow + '): ' + e); }
  });
  return stats;
}

function getLineStats() {
  try {
    const sheet = SpreadsheetApp.openById(SUMMARY_SS_ID).getSheetByName('MTP_summary');
    return readDmfPfwStats(sheet);
  } catch(e) {
    Logger.log('getLineStats hatası: ' + e);
    return {};
  }
}

const COUNTRY_ISO2 = {
  'turkiye':'tr','turkey':'tr','tr':'tr',
  'almanya':'de','germany':'de','deutschland':'de','de':'de',
  'fransa':'fr','france':'fr','fr':'fr',
  'italya':'it','italy':'it','italia':'it','it':'it',
  'ispanya':'es','spain':'es','espana':'es','es':'es',
  'ingiltere':'gb','birlesik krallik':'gb','united kingdom':'gb','uk':'gb','gb':'gb',
  'amerika':'us','abd':'us','united states':'us','usa':'us','us':'us',
  'cin':'cn','china':'cn','cn':'cn',
  'hindistan':'in','india':'in','in':'in',
  'japonya':'jp','japan':'jp','jp':'jp',
  'guney kore':'kr','south korea':'kr','korea':'kr','kr':'kr',
  'brezilya':'br','brazil':'br','br':'br',
  'rusya':'ru','russia':'ru','ru':'ru',
  'polonya':'pl','poland':'pl','pl':'pl',
  'cekya':'cz','cek cumhuriyeti':'cz','czech republic':'cz','czechia':'cz','cz':'cz',
  'romanya':'ro','romania':'ro','ro':'ro',
  'isvec':'se','sweden':'se','se':'se',
  'slovakya':'sk','slovakia':'sk','sk':'sk',
  'macaristan':'hu','hungary':'hu','hu':'hu',
  'meksika':'mx','mexico':'mx','mx':'mx',
  'hollanda':'nl','netherlands':'nl','nl':'nl',
  'belcika':'be','belgium':'be','be':'be',
  'avusturya':'at','austria':'at','at':'at',
  'portekiz':'pt','portugal':'pt','pt':'pt',
  'isvicre':'ch','switzerland':'ch','ch':'ch',
  'iran':'ir','ir':'ir',
  'fas':'ma','morocco':'ma','ma':'ma',
  'tunus':'tn','tunisia':'tn','tn':'tn',
  'guney afrika':'za','south africa':'za','za':'za',
  'ukrayna':'ua','ukraine':'ua','ua':'ua',
  'bulgaristan':'bg','bulgaria':'bg','bg':'bg',
  'sirbistan':'rs','serbia':'rs','rs':'rs',
  'yunanistan':'gr','greece':'gr','gr':'gr',
  'kanada':'ca','canada':'ca','ca':'ca',
  'avustralya':'au','australia':'au','au':'au',
  'tayland':'th','thailand':'th','th':'th',
  'endonezya':'id','indonesia':'id','id':'id',
  'vietnam':'vn','vn':'vn',
  'misir':'eg','egypt':'eg','eg':'eg',
  'finlandiya':'fi','finland':'fi','fi':'fi',
  'danimarka':'dk','denmark':'dk','dk':'dk',
  'norvec':'no','norway':'no','no':'no',
  'slovenya':'si','slovenia':'si','si':'si',
  'hirvatistan':'hr','croatia':'hr','hr':'hr'
};

function countryFlagUrl(raw) {
  const ascii = String(raw || '').trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[\u0131]/g, 'i');
  if (!ascii) return '';
  const iso = COUNTRY_ISO2[ascii] || (/^[a-z]{2}$/.test(ascii) ? ascii : '');
  return iso ? ('https://flagcdn.com/48x36/' + iso + '.png') : '';
}

// ─── Hat Yükü ve Darboğaz Motoru ──────────────────────────────────────────────
// Ürün adetlerini hatlara toplulaştırıp doluluk yüzdesi üretir. Hem darboğaz
// ekranı hem uyarı e-postası bu TEK kaynaktan beslenir — arayüzdeki hesapla
// e-postadaki hesabın ayrışması mümkün değil.
//
// Kapasitesi TANIMSIZ hatlar `capacity: null` ile döner ve doluluk hesaplanmaz
// (occupancy: null). "Kapasite yok" ile "doluluk %0" birbirine karıştırılmaz.
var YEAR_LABELS = ['2027', '2028', '2029', '2030', '2031'];
var VOL_FIELDS  = ['vol26', 'vol27', 'vol28', 'vol29', 'vol30'];

function computeLineLoads(data) {
  var rows = data.globalData || [];
  var lineStats = data.lineStats || {};
  var eDriveStats = data.eDriveLineStats || {};
  var pfwMap = data.pfwMap || {};
  var acc = {};

  var bucket = function (rawName, type) {
    var name = String(rawName || '').trim();
    if (!name || name === '-') return null;
    var key = type + ':' + normLineName(name);
    if (!acc[key]) acc[key] = { type: type, lineName: name, key: normLineName(name), vols: [0, 0, 0, 0, 0], split: false };
    return acc[key];
  };

  rows.forEach(function (r) {
    var vols = VOL_FIELDS.map(function (f) { return Number(r[f]) || 0; });
    [['PPCA', r.ppcaLine], ['Disc', r.diskLine], ['DMF', r.dmfLine]].forEach(function (t) {
      var b = bucket(t[1], t[0]);
      if (b) for (var i = 0; i < 5; i++) b.vols[i] += vols[i];
    });

    // PFW / SG / DP: aynı DMF birden çok hatta gidiyorsa adet hatlara EŞİT bölünür.
    // Bu bir varsayımdır ve `split: true` ile işaretlenir; arayüz bunu rozetle gösterir.
    var pd = r.dmf ? pfwMap[String(r.dmf).toUpperCase()] : null;
    if (!pd) return;
    [['PFW', pd.pfwLines], ['SG', pd.sgLines], ['DP', pd.dpLines]].forEach(function (t) {
      var lines = t[1] || [];
      if (!lines.length) return;
      var n = lines.length;
      lines.forEach(function (ln) {
        var b = bucket(ln, t[0]);
        if (!b) return;
        if (n > 1) b.split = true;
        for (var i = 0; i < 5; i++) b.vols[i] += vols[i] / n;
      });
    });
  });

  // e-Drive hatları adetlerini kendi kapasite tablosundan alır
  Object.keys(eDriveStats).forEach(function (k) {
    var st = eDriveStats[k];
    acc['EDrive:' + k] = {
      type: 'EDrive', lineName: st.lineName || k, key: k, split: false,
      vols: [st.v26 || 0, st.v27 || 0, st.v28 || 0, st.v29 || 0, st.v30 || 0]
    };
  });

  var out = [];
  Object.keys(acc).forEach(function (key) {
    var b = acc[key];
    var stat = eDriveStats[b.key] || lineStats[b.key] || lineStats[String(b.lineName).replace(/[^A-Z0-9]/gi, '').toUpperCase()] || {};
    var cap = stat.annualCapacity;
    var capacity = (cap === null || cap === undefined || !(Number(cap) > 0)) ? null : Number(cap);
    var total = b.vols.reduce(function (a, v) { return a + v; }, 0);
    if (total <= 0 && !capacity) return;
    out.push({
      type: b.type,
      lineName: b.lineName,
      key: b.key,
      capacity: capacity,
      estimated: !!stat.estimated,
      source: stat.source || '',
      split: b.split,
      volumes: b.vols,
      occupancy: b.vols.map(function (v) { return capacity ? (v / capacity) * 100 : null; })
    });
  });

  out.sort(function (a, b) { return a.lineName.localeCompare(b.lineName, undefined, { numeric: true }); });
  return out;
}

// Doluluğu eşiğin üzerinde olan hatları, en kritik yıl yüzdesine göre sıralı döner.
function findOverloadedLines(loads, thresholdPct) {
  var limit = thresholdPct || 100;
  var hits = [];
  loads.forEach(function (l) {
    if (!l.capacity) return;
    var worst = -1, worstYear = null;
    l.occupancy.forEach(function (p, i) {
      if (p !== null && p > limit && p > worst) { worst = p; worstYear = YEAR_LABELS[i]; }
    });
    if (worst > limit) hits.push({ line: l, worstPct: worst, worstYear: worstYear });
  });
  hits.sort(function (a, b) { return b.worstPct - a.worstPct; });
  return hits;
}

// Arayüzün çağırdığı tek giriş noktası: yükler + darboğazlar + eşikler.
function getLineLoads() {
  var data = getSpreadsheetData();
  if (data.error) return data;
  var loads = computeLineLoads(data);
  return {
    loads: loads,
    overloaded: findOverloadedLines(loads, OCCUPANCY_WARN_PCT - 1).map(function (h) {
      return { lineName: h.line.lineName, type: h.line.type, worstPct: h.worstPct, worstYear: h.worstYear };
    }),
    thresholds: { warn: OCCUPANCY_WARN_PCT, crit: OCCUPANCY_CRIT_PCT },
    readAt: data.readAt || Date.now()
  };
}

// ─── Otomasyon: kapasite aşımı uyarısı ────────────────────────────────────────
// Zamanlanmış tetikleyiciden çalışır (bkz. kurTetikleyiciler). Eşiği aşan hatları
// bulup e-posta gönderir. Aynı durumu üst üste bildirmemek için son gönderilen
// özet Script Properties'te tutulur.
function sendCapacityAlerts() {
  var to = _recipients(CONFIG.ALERT_NOTIFY_EMAIL);
  if (!to) { Logger.log('ALERT_NOTIFY_EMAIL boş, uyarı gönderilmedi.'); return { ok: false, code: 'NO_RECIPIENT' }; }

  var data = getSpreadsheetData();
  if (data.error) {
    MailApp.sendEmail({
      to: to,
      subject: '[C09 Capacity] UYARI — pano verisi okunamıyor',
      body: 'Kapasite panosu kaynak veriyi okuyamadı.\n\nHata: ' + data.error + '\n' + (data.message || '')
    });
    return { ok: false, code: data.error };
  }

  var loads = computeLineLoads(data);
  var hits  = findOverloadedLines(loads, OCCUPANCY_WARN_PCT - 1);
  var missing = (data.quality && data.quality.linesWithoutCapacity) || [];

  var fingerprint = hits.map(function (h) { return h.line.key + '@' + Math.round(h.worstPct); }).join(',') +
                    '|missing:' + missing.length;
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty('LAST_ALERT_FINGERPRINT') === fingerprint) {
    Logger.log('Uyarı durumu değişmedi, e-posta gönderilmedi.');
    return { ok: true, code: 'UNCHANGED', count: hits.length };
  }

  if (!hits.length && !missing.length) {
    props.setProperty('LAST_ALERT_FINGERPRINT', fingerprint);
    return { ok: true, code: 'ALL_CLEAR', count: 0 };
  }

  var lines = ['C09 Capacity — kapasite durumu (' +
    Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm') + ')', ''];

  if (hits.length) {
    lines.push('KAPASİTESİ AŞAN HATLAR (' + hits.length + ')');
    lines.push('Eşik: %' + OCCUPANCY_WARN_PCT + ' sarı, %' + OCCUPANCY_CRIT_PCT + ' kırmızı.');
    lines.push('');
    hits.slice(0, 40).forEach(function (h) {
      var l = h.line;
      lines.push('• ' + l.type + ' ' + l.lineName + ' — en yüksek %' + h.worstPct.toFixed(0) + ' (' + h.worstYear + ')' +
                 (l.estimated ? '  [kapasite tahmini]' : '') + (l.split ? '  [adet hatlara eşit bölündü]' : ''));
      lines.push('   Kapasite: ' + l.capacity.toLocaleString('tr-TR') + '  ·  ' +
                 YEAR_LABELS.map(function (y, i) {
                   return y + ': ' + (l.occupancy[i] === null ? '—' : '%' + l.occupancy[i].toFixed(0));
                 }).join('  '));
    });
    lines.push('');
  }

  if (missing.length) {
    lines.push('KAPASİTESİ TANIMSIZ HATLAR (' + missing.length + ')');
    lines.push('Bu hatlar için doluluk HESAPLANAMIYOR — panoda "kapasite tanımsız" görünürler.');
    missing.slice(0, 30).forEach(function (m) { lines.push('• ' + m.name + ' (' + m.types + ')'); });
    lines.push('');
  }

  if (data.warnings && data.warnings.length) {
    lines.push('SİSTEM UYARILARI');
    data.warnings.forEach(function (w) { lines.push('• ' + w.code + ': ' + w.detail); });
  }

  MailApp.sendEmail({
    to: to,
    subject: '[C09 Capacity] ' + (hits.length ? hits.length + ' hat kapasiteyi aşıyor' : 'Kapasite verisi eksik'),
    body: lines.join('\n')
  });
  props.setProperty('LAST_ALERT_FINGERPRINT', fingerprint);
  return { ok: true, count: hits.length, missing: missing.length };
}

// ─── Otomasyon: yedek, arşiv, kullanım raporu ─────────────────────────────────

// Günlük yedek: kaynak e-tabloların kopyasını yedek klasörüne alır (RPO ≈ 24 saat).
// BACKUP_FOLDER_ID tanımlı değilse sessizce atlanır.
function backupSourceSpreadsheets() {
  if (!CONFIG.BACKUP_FOLDER_ID) { Logger.log('BACKUP_FOLDER_ID tanımsız, yedek alınmadı.'); return { ok: false, code: 'NOT_CONFIGURED' }; }
  var stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  var folder = DriveApp.getFolderById(CONFIG.BACKUP_FOLDER_ID);
  var done = [];
  [['MAIN', MAIN_SS_ID], ['SUMMARY', SUMMARY_SS_ID], ['EDRIVE', EDRIVE_SS_ID]].forEach(function (t) {
    try {
      var f = DriveApp.getFileById(t[1]);
      f.makeCopy(stamp + '_' + t[0] + '_' + f.getName(), folder);
      done.push(t[0]);
    } catch (e) {
      Logger.log('Yedek alınamadı (' + t[0] + '): ' + e);
    }
  });
  return { ok: done.length > 0, copied: done };
}

// Yıllık plan arşivi: bugünkü hat yüklerini tarihli bir satır kümesi olarak yazar.
// Geçmiş veri BUGÜN biriktirilmeye başlanmazsa geriye dönük üretilemez — tahmin
// doğruluğu ve geri test ancak bu arşivle mümkün olur.
function archivePlanSnapshot() {
  if (!CONFIG.ARCHIVE_SS_ID) { Logger.log('ARCHIVE_SS_ID tanımsız, arşiv yazılmadı.'); return { ok: false, code: 'NOT_CONFIGURED' }; }
  var data = getSpreadsheetData();
  if (data.error) return { ok: false, code: data.error };

  var ss = SpreadsheetApp.openById(CONFIG.ARCHIVE_SS_ID);
  var sheet = ss.getSheetByName('PlanArsivi');
  if (!sheet) {
    sheet = ss.insertSheet('PlanArsivi');
    sheet.appendRow(['Tarih', 'Tip', 'Hat', 'Kapasite', 'Tahmini mi'].concat(YEAR_LABELS));
    sheet.getRange(1, 1, 1, 5 + YEAR_LABELS.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  var stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  var rows = computeLineLoads(data).map(function (l) {
    return [stamp, l.type, l.lineName, l.capacity === null ? '' : l.capacity, l.estimated ? 'E' : '']
      .concat(l.volumes.map(function (v) { return Math.round(v); }));
  });
  if (!rows.length) return { ok: true, written: 0 };
  sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
  return { ok: true, written: rows.length };
}

// Kullanım raporu: giriş logundan kaç kişi, kaç oturum, ortalama süre.
// ROI iddiasını kanıta çevirmek için gereken tek veri — zaten toplanıyordu,
// hiçbir yerde okunmuyordu.
function getUsageStats() {
  try {
    var sheet = SpreadsheetApp.openById(FB_SHEET_ID).getSheetByName(LOG_SHEET);
    if (!sheet) return { ok: false, code: 'NO_LOG' };
    var last = sheet.getLastRow();
    if (last < 2) return { ok: true, sessions: 0, users: 0 };
    var rows = sheet.getRange(2, 1, last - 1, 6).getValues();
    var users = {}, durations = [], byDay = {}, closed = 0;
    var since = new Date(); since.setDate(since.getDate() - 90);
    rows.forEach(function (r) {
      var email = String(r[1] || '');
      var start = r[2] instanceof Date ? r[2] : null;
      if (!start || start < since) return;
      users[email] = (users[email] || 0) + 1;
      var day = Utilities.formatDate(start, Session.getScriptTimeZone(), 'yyyy-MM-dd');
      byDay[day] = (byDay[day] || 0) + 1;
      var mins = Number(r[4]);
      if (r[5] === 'Tamamlandı' && !isNaN(mins) && mins > 0) { durations.push(mins); closed++; }
    });
    durations.sort(function (a, b) { return a - b; });
    var sessions = Object.keys(byDay).reduce(function (a, d) { return a + byDay[d]; }, 0);
    var days = Object.keys(byDay).length || 1;
    return {
      ok: true,
      windowDays: 90,
      sessions: sessions,
      users: Object.keys(users).length,
      sessionsPerDay: Math.round(sessions / days * 10) / 10,
      medianMinutes: durations.length ? durations[Math.floor(durations.length / 2)] : null,
      closedSessions: closed,
      topUsers: Object.keys(users).map(function (u) { return { user: u, sessions: users[u] }; })
        .sort(function (a, b) { return b.sessions - a.sessions; }).slice(0, 10)
    };
  } catch (e) {
    Logger.log('getUsageStats hatası: ' + e);
    return { ok: false, code: 'ERROR' };
  }
}

// Arama terimi istatistiği: KİŞİ BİLGİSİ YAZILMAZ, yalnızca terim + zaman.
// "İnsanlar bu araca ne soruyor?" verisi ürün kararları için gerekli; kişiselleştirme
// KVKK/veri minimizasyonu gereği bilinçli olarak yapılmıyor.
function logSearchTerm(term) {
  var t = String(term || '').trim().toLowerCase().slice(0, 60);
  if (t.length < 2) return;
  try {
    var ss = SpreadsheetApp.openById(FB_SHEET_ID);
    var sheet = ss.getSheetByName(SEARCH_LOG_SHEET);
    if (!sheet) {
      sheet = ss.insertSheet(SEARCH_LOG_SHEET);
      sheet.appendRow(['Tarih', 'Terim']);
      sheet.getRange(1, 1, 1, 2).setFontWeight('bold');
      sheet.setFrozenRows(1);
    }
    sheet.appendRow([new Date(), t]);
  } catch (e) {
    Logger.log('Arama terimi yazılamadı: ' + e);
  }
}

// ─── Kurulum: tetikleyiciler ──────────────────────────────────────────────────
// Apps Script düzenleyicisinde bir kez çalıştırılır. Var olan tetikleyicileri
// silip yeniden kurar, böylece iki kez çalıştırılsa da kopyalanmaz.
function kurTetikleyiciler() {
  var wanted = ['sendCapacityAlerts', 'clearCache', 'backupSourceSpreadsheets', 'archivePlanSnapshot'];
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (wanted.indexOf(t.getHandlerFunction()) !== -1) ScriptApp.deleteTrigger(t);
  });

  // Haftalık kapasite aşımı uyarısı — Pazartesi 07:00
  ScriptApp.newTrigger('sendCapacityAlerts').timeBased().onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(7).create();
  // Önbelleği saatlik tazele (elle clearCache çalıştırma ihtiyacını bitirir)
  ScriptApp.newTrigger('clearCache').timeBased().everyHours(1).create();
  // Günlük yedek — 02:00
  ScriptApp.newTrigger('backupSourceSpreadsheets').timeBased().everyDays(1).atHour(2).create();
  // Aylık plan arşivi — ayın 1'i 03:00
  ScriptApp.newTrigger('archivePlanSnapshot').timeBased().onMonthDay(1).atHour(3).create();

  Logger.log('Tetikleyiciler kuruldu: ' + wanted.join(', '));
  return { ok: true, triggers: wanted };
}

// ─── Teşhis Fonksiyonları ─────────────────────────────────────────────────────
// Üretim akışının parçası DEĞİLDİR: yalnızca Apps Script düzenleyicisinden elle
// çalıştırılan, "İcra günlüğü"ne çıktı yazan teşhis araçları.

// TEŞHİS: DMF/PFW satırlarının summary'de nerede olduğunu, hangi değerleri
// içerdiğini ve kodun bunlar için NE çözümlediğini tek log'da gösterir.
// Apps Script editöründe fonksiyon listesinden debugDMFRows seç → Çalıştır →
// "İcra günlüğü" çıktısını kopyala.
function debugDMFRows() {
  const sheet = SpreadsheetApp.openById(SUMMARY_SS_ID).getSheetByName('MTP_summary');
  const lastRow = sheet.getLastRow();
  const allData = sheet.getRange(2, 1, lastRow - 1, 14).getValues();

  Logger.log('=== A) DMF/PFW anahtarı üreten TÜM satırlar (satır no + C adı + değerler) ===');
  allData.forEach((row, idx) => {
    const rowNum = idx + 2;
    const key = normLineName(String(row[2] || row[1] || ''));
    if (key.startsWith('DMF') || key.startsWith('PFW')) {
      Logger.log('Satır ' + rowNum + ': C="' + row[2] + '" key=' + key +
        ' | D(CT)=' + row[3] + ' E(TRP)=' + row[4] + ' F(SD)=' + row[5] +
        ' G=' + row[6] + ' H=' + row[7] + ' I=' + row[8] + ' J=' + row[9] + ' K(Cap)=' + row[10]);
    }
  });

  Logger.log('=== B) Sabit yedek bloklar (DMF 50-53 / PFW 54-57), C-K sütunları ===');
  sheet.getRange(50, 3, 8, 9).getValues().forEach((r, i) => {
    Logger.log('Satır ' + (50+i) + ': C="' + r[0] + '" D(CT)=' + r[1] + ' E(TRP)=' + r[2] +
      ' F(SD)=' + r[3] + ' K(Cap)=' + r[8]);
  });

  Logger.log('=== C) Kodun ŞU AN çözümlediği DMF/PFW değerleri (dashboard bunu kullanır) ===');
  const resolved = readDmfPfwStats(sheet);
  ['DMF1','DMF2','DMF3','DMF4','PFW1','PFW2','PFW3','PFW4'].forEach(k => {
    const s = resolved[k];
    Logger.log(k + ' → ' + (s ? ('CT=' + s.cycleTime + ' TRP=' + s.trp + ' SD=' + s.shiftDay + ' Cap=' + s.annualCapacity) : '(bulunamadı)'));
  });
}

// PFW teşhisi: PFW2 adetleri nereye gidiyor? (çakışma / eşleşmeme tespiti)
function debugPFW() {
  const mainSs   = SpreadsheetApp.openById(MAIN_SS_ID);
  const pfwSheet = mainSs.getSheetByName('PFW');
  const mtpSheet = mainSs.getSheetByName("MTP'27");

  // 1) MAIN ürünlerinden DMF ref -> 5 yıl toplam adet
  const mtpLastRow = Math.max(mtpSheet.getLastRow(), 8);
  const mtpRaw = mtpSheet.getRange(8, 1, mtpLastRow - 7, 100).getValues();
  const volByDmf = {};
  mtpRaw.forEach(row => {
    const dmf = String(row[33] || '').trim().toUpperCase();   // W
    if (!dmf) return;
    const v = (Number(row[82])||0)+(Number(row[83])||0)+(Number(row[84])||0)+(Number(row[85])||0)+(Number(row[86])||0);
    volByDmf[dmf] = (volByDmf[dmf] || 0) + v;
  });

  // 2) PFW sayfası: DMF ref -> hangi PFW hat(lar)ına gidiyor
  const pfwLastRow = Math.max(pfwSheet.getLastRow(), 1);
  const pfwRaw = pfwSheet.getRange(1, 1, pfwLastRow, 9).getValues();
  const dmfToLines = {};   // dmfRef -> { lineKey: rawLineName }
  const lastWins   = {};   // dmfRef -> lineKey (kodun kullandığı: son satır kazanır)
  const rowsPerLine = {};  // lineKey -> PFW sayfasındaki satır sayısı
  pfwRaw.forEach((row, i) => {
    if (i === 0) return;                                  // başlık satırı
    const dmf     = String(row[1] || '').trim().toUpperCase();  // B
    const pfwRef  = String(row[3] || '').trim();               // D
    const lineRaw = String(row[4] || '').trim();               // E
    if (!dmf || !pfwRef) return;
    const lk = normLineName(lineRaw);
    rowsPerLine[lk] = (rowsPerLine[lk] || 0) + 1;
    if (!dmfToLines[dmf]) dmfToLines[dmf] = {};
    dmfToLines[dmf][lk] = lineRaw;
    lastWins[dmf] = lk;                                   // overwrite = son satır kazanır
  });

  // 3) Her PFW hattının "kodun şu an saydığı" toplam adedi
  const volByLine = {};
  Object.keys(volByDmf).forEach(dmf => {
    const lk = lastWins[dmf];
    if (lk) volByLine[lk] = (volByLine[lk] || 0) + volByDmf[dmf];
  });

  Logger.log('=== A) PFW hatları: PFW satır sayısı + ŞU AN sayılan 5 yıl toplam adet ===');
  Object.keys(rowsPerLine).sort().forEach(lk => {
    Logger.log(lk + ' -> PFW sayfasinda ' + rowsPerLine[lk] + ' satir | su an sayilan adet: ' + (volByLine[lk] || 0));
  });

  // 4) Çakışmalar: aynı DMF birden çok PFW hattında
  Logger.log('=== B) CAKISMA: ayni DMF birden fazla PFW hattinda (son satir kazanir, digerleri kaybolur) ===');
  let conflictCount = 0; const lostByLine = {};
  Object.keys(dmfToLines).forEach(dmf => {
    const lines = Object.keys(dmfToLines[dmf]);
    if (lines.length > 1) {
      conflictCount++;
      const winner = lastWins[dmf];
      lines.filter(l => l !== winner).forEach(l => { lostByLine[l] = (lostByLine[l] || 0) + (volByDmf[dmf] || 0); });
      if (conflictCount <= 25) {
        Logger.log('DMF ' + dmf + ' -> hatlar [' + lines.join(', ') + '] | KAZANAN: ' + winner + ' | adet: ' + (volByDmf[dmf] || 0));
      }
    }
  });
  Logger.log('Toplam cakisan DMF sayisi: ' + conflictCount);
  Logger.log('--- Cakisma yuzunden KAYBEDEN hatlar ve kaybettikleri adet ---');
  Object.keys(lostByLine).sort().forEach(l => Logger.log(l + ' kaybettigi adet: ' + lostByLine[l]));

  // 5) PFW2 odak
  Logger.log('=== C) PFW2 ODAK: PFW2 satirlarindaki DMF refleri nereye gidiyor? ===');
  let pfw2Total = 0, pfw2Lost = 0, pfw2NoMatch = 0, pfw2Rows = 0;
  Object.keys(dmfToLines).forEach(dmf => {
    if (!dmfToLines[dmf]['PFW2']) return;
    pfw2Rows++;
    const vol = volByDmf[dmf];
    if (vol === undefined) { pfw2NoMatch++; return; }
    pfw2Total += vol;
    const winner = lastWins[dmf];
    if (winner !== 'PFW2') {
      pfw2Lost += vol;
      Logger.log('PFW2 DMF ' + dmf + ' adet ' + vol + ' -> ' + winner + ' hattina gitti (calindi)');
    }
  });
  Logger.log('PFW2 DMF ref sayisi (PFW sayfasinda): ' + pfw2Rows);
  Logger.log('PFW2 DMF reflerinin urunlerdeki toplam adedi: ' + pfw2Total);
  Logger.log('Bunlardan baska hatta gidip kaybolan adet: ' + pfw2Lost);
  Logger.log('PFW2 DMF refi urunlerde HIC eslesmeyen ref sayisi: ' + pfw2NoMatch);
}