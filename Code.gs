// ─── Yapılandırma: tüm dosya/klasör kimlikleri ve sabitler tek yerde ──────────
var PROJECT_NAME          = 'Capacity_C09';
var LOG_SHEET             = PROJECT_NAME + '_GirisLoglari';
var TIMEOUT_MIN           = 10;
var FB_SHEET_ID           = '1dT55ZmEYScXA-BLpWDimuBtTzGZi13Qn0mAdbc2iWyM';
var FEEDBACK_NOTIFY_EMAIL = 'mustafa.erdogan@valeo.com';
var MAIN_SS_ID            = '1SpLc32ad9K7HEMUWdMDNMxIRkKe73qaK0Pxw4SZvARk';
var SUMMARY_SS_ID         = '1Lx2IniscO0hfdnZi12chv24dooB_pePJtUjKolB97C0';
var EDRIVE_SS_ID          = '1pdPtUMFP8TYK8YCeEzIrSOZxL-Km7FzJBY5CXfLAU14';
var LAYOUT_FOLDER_ID      = '1X2jhb_li2c-WxKBld8p3GHUeZMwuOR_H';
var EDRIVE_IMG_FILE_ID    = '1diFZjZq6mWHjzxp07VjD-DuXcoNq54Uy';
var CACHE_KEY             = 'spreadsheet_data_v34';
// MTP_summary'de e-Drive hat bloğunun beklenen ilk satırı (4 satır okunur);
// blok kaymışsa (satır eklendi/silindi) hat adlarıyla tüm sayfa taranır
var EDRIVE_STATS_ROW      = 97;
// MTP_summary'de DMF/PFW yedek blokları (isimle bulunamazsa): DMF 50-53, PFW 54-57
var DMF_FALLBACK_ROW      = 50;
var PFW_FALLBACK_ROW      = 54;

function doGet() {
  var session  = createSession();
  var template = HtmlService.createTemplateFromFile('Index');
  template.sessionId  = session.sessionId;
  template.userEmail  = session.email;
  template.timeoutMin = TIMEOUT_MIN;
  var execUrl = '';
  try { execUrl = ScriptApp.getService().getUrl() || ''; } catch (e) {}
  template.execUrl = execUrl;
  return template.evaluate()
    .setTitle('C09 Capacity Dashboard')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

// Çıkış kaydı: sayfa kapanırken tarayıcının sendBeacon isteği buraya düşer
// (google.script.run kapanış sırasında çoğu zaman iptal edildiği için)
function doPost(e) {
  try {
    var p = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (p.action === 'logExit' && p.sessionId) {
      logExit(String(p.sessionId), Number(p.exitTimestamp) || Date.now(), Number(p.durationSec) || 0);
    }
  } catch (err) {}
  return ContentService.createTextOutput('ok');
}

function getEDriveImage() {
  return getLayoutImage(EDRIVE_IMG_FILE_ID);
}

// ─── Feedback Widget ───────────────────────────────────────────────────────────

function submitFeedback(payload) {
  var ss      = SpreadsheetApp.openById(FB_SHEET_ID);
  var tabName = payload.appName || 'Genel';
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

  var attachmentUrl = _saveFeedbackImage(id, payload.image);

  sheet.appendRow([id, email,
    payload.feedbackType || '', payload.priority || '',
    payload.message || '', now, '', 'Open', '', attachmentUrl]);

  _notifyFeedbackByEmail(id, email, payload, now, attachmentUrl);

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
    MailApp.sendEmail({
      to: FEEDBACK_NOTIFY_EMAIL,
      subject: subject,
      body: lines.join('\n')
    });
  } catch (e) {
    // E-posta gönderimi başarısız olsa da geri bildirim kaydı tamamlanmış olur
  }
}

function _saveFeedbackImage(feedbackId, image) {
  if (!image || !image.data || !image.mimeType) return '';
  var allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
  if (allowedTypes.indexOf(image.mimeType) === -1) return '';

  try {
    var folderName = PROJECT_NAME + '_GeriBildirimGorselleri';
    var folders = DriveApp.getFoldersByName(folderName);
    var folder  = folders.hasNext() ? folders.next() : DriveApp.createFolder(folderName);

    var base64Data = String(image.data).split(',').pop();
    var fileName   = feedbackId + '_' + (image.fileName || 'ekran-goruntusu');
    var blob       = Utilities.newBlob(Utilities.base64Decode(base64Data), image.mimeType, fileName);
    var file       = folder.createFile(blob);
    // Şirket dışına açılmasın: yalnızca domain içi link paylaşımı; domain yoksa dosya özel kalır
    try {
      file.setSharing(DriveApp.Access.DOMAIN_WITH_LINK, DriveApp.Permission.VIEW);
    } catch (e) {}
    return file.getUrl();
  } catch (e) {
    return '';
  }
}

// ─── Giriş/Çıkış Loglama ──────────────────────────────────────────────────────
// FB_SHEET_ID / PROJECT_NAME / LOG_SHEET / TIMEOUT_MIN dosyanın başındaki
// yapılandırma bloğunda tanımlıdır.

function createSession() {
  var sheet     = _getOrCreateLogSheet();
  var sessionId = Utilities.getUuid();
  var email     = Session.getActiveUser().getEmail() || 'Anonim';
  sheet.appendRow([sessionId, email, new Date(), '', '', 'Açık']);
  return { sessionId: sessionId, email: email };
}

function logExit(sessionId, exitTimestamp, durationSec) {
  var lock = LockService.getScriptLock();
  try { lock.waitLock(3000); } catch (e) { return; }
  try {
    var sheet = _getOrCreateLogSheet();
    // Oturum ID benzersiz (UUID); tüm sayfayı okumak yerine TextFinder ile bulunur
    var finder = sheet.createTextFinder(String(sessionId)).matchEntireCell(true);
    var cell = finder.findNext();
    while (cell) {
      var row = cell.getRow();
      if (cell.getColumn() === 1 && row > 1 && sheet.getRange(row, 6).getValue() === 'Açık') {
        sheet.getRange(row, 4).setValue(new Date(exitTimestamp));
        sheet.getRange(row, 5).setValue(Math.round(durationSec / 60 * 10) / 10);
        sheet.getRange(row, 6).setValue('Tamamlandı');
        break;
      }
      cell = finder.findNext();
    }
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
    var folder = DriveApp.getFolderById(LAYOUT_FOLDER_ID);
    var files = folder.getFiles();
    var map = {};
    while (files.hasNext()) {
      var file = files.next();
      var rawName = file.getName().replace(/\.(jpg|jpeg|png|gif|bmp|webp|pdf)$/i, '');
      var key = rawName.replace(/[^A-Z0-9]/gi, '').toUpperCase();
      map[key] = file.getId();
    }
    return { ok: true, map: map };
  } catch (e) {
    return { ok: false, error: e.toString(), map: {} };
  }
}

function getLayoutImage(fileId) {
  try {
    var file = DriveApp.getFileById(fileId);
    var blob = file.getBlob();
    var bytes = blob.getBytes();
    return {
      ok: true,
      dataUrl: 'data:' + blob.getContentType() + ';base64,' + Utilities.base64Encode(bytes)
    };
  } catch (e) {
    return { ok: false, error: e.toString() };
  }
}

function getSpreadsheetData() {
  const cache = CacheService.getScriptCache();
  const cached = cache.get(CACHE_KEY);
  if (cached) {
    try {
      const result = JSON.parse(cached);
      // DMF/PFW istatistiklerini her zaman sheet'ten canlı güncelle (cache'i bypass et)
      const summarySs = SpreadsheetApp.openById(SUMMARY_SS_ID);
      const summarySheet = summarySs.getSheetByName('MTP_summary');
      if (summarySheet && result.lineStats) {
        const freshStats = readDmfPfwStats(summarySheet);
        Object.keys(freshStats).forEach(function(k) { result.lineStats[k] = freshStats[k]; });
      }
      return result;
    } catch (e) { /* cache bozuk, devam et */ }
  }

  try {
    const mainSs = SpreadsheetApp.openById(MAIN_SS_ID);
    const summarySs = SpreadsheetApp.openById(SUMMARY_SS_ID);
    
    const mtpSheet = mainSs.getSheetByName("MTP'27");
    const diagSheet = mainSs.getSheetByName('Diaphragm Line');
    const summarySheet = summarySs.getSheetByName('MTP_summary');
    
    if (!mtpSheet || !diagSheet || !summarySheet) {
      throw new Error("Gerekli sekmelerden biri bulunamadı.");
    }
    
    // 1. HAT BAZLI KAPASİTE VERİLERİ (TÜM BOŞLUKLARI SİLEREK VE BÜYÜK HARFLE EŞLE)
    // 17 sütun okunur (A-Q): 4b'deki e-Drive bloğu da aynı okumayı kullanır (M-Q adetleri için)
    const summaryLastRow = Math.max(summarySheet.getLastRow(), 2);
    const summaryRaw = summarySheet.getRange(2, 1, summaryLastRow - 1, 17).getValues();
    const lineStatsMap = {};
    
    summaryRaw.forEach((row) => {
      const rawName = String(row[2] || row[1] || '');
      const fullKey = rawName.replace(/[^A-Z0-9]/gi, '').toUpperCase();
      const stripKey = normLineName(rawName);
      if (fullKey) {
        const val = {
          cycleTime: row[3] || '-',
          trp: row[4] || '-',
          shiftDay: row[5] || '-',
          annualCapacity: Number(row[10]) || 0
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
                          drivePlate: '', drivePlateLine: '', pfwLines: [], pfwPairs: [] };
        }
        const e = pfwMap[key];
        e.pfw             = pfwRef;
        e.pfwLine         = String(row[4] || '').trim();  // E
        e.springGuide     = String(row[5] || '').trim();  // F
        e.springGuideLine = String(row[6] || '').trim();  // G
        e.drivePlate      = String(row[7] || '').trim();  // H
        e.drivePlateLine  = String(row[8] || '').trim();  // I
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
    } catch(e) {}

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
          annualCapacity: Number(r[10]) || 0,     // K
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
    } catch(e) {}

    // Kapasite kartı OLAN e-Drive hatları (summary sırasıyla normalize anahtarlar)
    const eDriveCardOrder = Object.keys(eDriveLineStats);

    // 5. ANA MTP VERİLERİ
    const mtpLastRow = Math.max(mtpSheet.getLastRow(), 8);
    const mtpRaw = mtpSheet.getRange(8, 1, mtpLastRow - 7, 100).getValues();

    const formattedData = mtpRaw.map(row => {
      const rawDiaphragm = String(row[36] || '').trim();  // AK sütunu
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

      const kitRef = String(row[40] || '').trim();  // AO sütunu
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
        ppca: String(row[27] || '').trim(),       // AB sütunu
        ppcaLine: String(row[26] || '').trim(),   // AA sütunu
        cover: String(row[37] || '').trim(),      // AL sütunu
        coverLine: String(row[38] || '').trim(),  // AM sütunu
        diaphragm: rawDiaphragm,                  // AK sütunu
        diaphragmFurnace: diagFurnaceInfo,
        diaphragmLines: diagLines,
        disk: String(row[30] || '').trim(),       // AE sütunu
        diskLine: String(row[29] || '').trim(),   // AD sütunu
        diskFamilyGroup: String(row[31] || '').trim(),  // AF sütunu
        dmf: String(row[33] || '').trim(),        // AH sütunu
        dmfLine: String(row[32] || '').trim(),    // AG sütunu
        eDriveLines: eDriveLines,
        familyGroup: String(row[28] || '').trim(),  // AC sütunu
        customer: String(row[5]  || '').trim(),     // F sütunu — Müşteri bilgisi
        customerName: String(row[6]  || '').trim(), // G sütunu — Müşteri tanımı
        customerCountry: String(row[12] || '').trim(), // M sütunu — Müşteri ülkesi
        customerFlag: countryFlagUrl(row[12]),         // M sütunundan üretilen bayrak görseli
        vol26: Number(row[82]) || 0,   // CE — 2027
        vol27: Number(row[83]) || 0,   // CF — 2028
        vol28: Number(row[84]) || 0,   // CG — 2029
        vol29: Number(row[85]) || 0,   // CH — 2030
        vol30: Number(row[86]) || 0    // CI — 2031
      };
    }).filter(item => item.kit !== '');

    const result = {
      globalData: formattedData,
      lineStats: lineStatsMap,
      eDriveData: eDriveData,
      eDriveLineStats: eDriveLineStats,
      pfwMap: pfwMap
    };

    try {
      const serialized = JSON.stringify(result);
      if (serialized.length < 90000) {
        cache.put(CACHE_KEY, serialized, 900); // 15 dakika
      } else {
        // Cache limiti (~100KB) yaklaşıldı: veri cache'lenmiyor, her istek sheet'ten okunacak.
        // Bu log görünmeye başlarsa veri küçültme / bölme gerekir.
        Logger.log('UYARI: Veri ' + serialized.length + ' karakter, cache atlandı (limit ~90000).');
      }
    } catch (e) { /* veri önbellek limitini aşıyor, atla */ }

    return result;

  } catch (error) {
    return { error: error.toString() };
  }
}

// Hat adını normalize eder; baştaki "VD03 " gibi istasyon kodunu atar (MTP_summary'de isimler "VD03 DMF1" formatında)
function normLineName(raw) {
  return String(raw || '').replace(/^\s*VD\s*\d+\s*/i, '').replace(/[^A-Z0-9]/gi, '').toUpperCase();
}

// DMF/PFW hat istatistikleri: önce isimle (DMF1-4 / PFW1-4), bulunamazsa sabit yedek
// bloklardan (DMF_FALLBACK_ROW=50-53 / PFW_FALLBACK_ROW=54-57). preRead verilirse
// (getSpreadsheetData tam okuma yaptıysa) sheet tekrar okunmaz.
function readDmfPfwStats(sheet, preRead) {
  const stats = {};
  if (!sheet) return stats;
  const fixedLineNames = [['DMF1','DMF2','DMF3','DMF4'], ['PFW1','PFW2','PFW3','PFW4']];
  const dmfPfwKeys = { DMF1:1, DMF2:1, DMF3:1, DMF4:1, PFW1:1, PFW2:1, PFW3:1, PFW4:1 };
  try {
    const data = preRead || sheet.getRange(2, 1, Math.max(sheet.getLastRow(), 2) - 1, 14).getValues();
    data.forEach(function(row) {
      const key = normLineName(row[2]);
      if (dmfPfwKeys[key]) {
        stats[key] = {
          cycleTime:      row[3] || '-',
          trp:            row[4] || '-',
          shiftDay:       row[5] || '-',
          annualCapacity: Number(row[10]) || 0
        };
      }
    });
  } catch(e) {}
  [DMF_FALLBACK_ROW, PFW_FALLBACK_ROW].forEach(function(startRow, gi) {
    try {
      sheet.getRange(startRow, 4, 4, 8).getValues().forEach(function(r, i) {
        const key = fixedLineNames[gi][i];
        if (!stats[key]) {
          stats[key] = {
            cycleTime:      r[0] || '-',
            trp:            r[1] || '-',
            shiftDay:       r[2] || '-',
            annualCapacity: Number(r[7]) || 0
          };
        }
      });
    } catch(e) {}
  });
  return stats;
}

function getLineStats() {
  try {
    const sheet = SpreadsheetApp.openById(SUMMARY_SS_ID).getSheetByName('MTP_summary');
    return readDmfPfwStats(sheet);
  } catch(e) {
    return {};
  }
}

function clearCache() {
  CacheService.getScriptCache().remove(CACHE_KEY);
  Logger.log('Cache temizlendi. Bir sonraki web app isteği sheet\'ten taze veri okuyacak.');
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

function debugDMFRows() {
  const sheet = SpreadsheetApp.openById(SUMMARY_SS_ID).getSheetByName('MTP_summary');
  const lastRow = sheet.getLastRow();
  const allData = sheet.getRange(2, 1, lastRow - 1, 14).getValues();

  Logger.log('=== MTP_summary içinde DMF key üreten TÜM satırlar ===');
  allData.forEach((row, idx) => {
    const rowNum = idx + 2;
    const rawName = String(row[2] || row[1] || '');
    const key = normLineName(rawName);
    if (key.startsWith('DMF')) {
      Logger.log('Satır ' + rowNum + ': B=' + row[1] + ' C=' + row[2] + ' key=' + key +
        ' CT=' + row[3] + ' TRP=' + row[4] + ' SD=' + row[5] + ' Cap=' + row[10]);
    }
  });
  Logger.log('=== Explicit blok (B50:K53) ===');
  sheet.getRange(50, 2, 4, 10).getValues().forEach((r, i) => {
    Logger.log('Satır ' + (50+i) + ': B=' + r[0] + ' CT=' + r[2] + ' TRP=' + r[3] + ' Cap=' + r[9]);
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