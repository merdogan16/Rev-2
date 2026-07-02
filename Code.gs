function doGet() {
  var session  = createSession();
  var template = HtmlService.createTemplateFromFile('Index');
  template.sessionId  = session.sessionId;
  template.userEmail  = session.email;
  template.timeoutMin = TIMEOUT_MIN;
  return template.evaluate()
    .setTitle('C09 Capacity Dashboard')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function getEDriveImage() {
  return getLayoutImage('1diFZjZq6mWHjzxp07VjD-DuXcoNq54Uy');
}

// ─── Feedback Widget ───────────────────────────────────────────────────────────
var FB_SHEET_ID = '1dT55ZmEYScXA-BLpWDimuBtTzGZi13Qn0mAdbc2iWyM';

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

var FEEDBACK_NOTIFY_EMAIL = 'mustafa.erdogan@valeo.com';

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
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return file.getUrl();
  } catch (e) {
    return '';
  }
}

// ─── Giriş/Çıkış Loglama ──────────────────────────────────────────────────────
// FB_SHEET_ID Modül 1'de tanımlı — aynı değişkeni kullanır
var PROJECT_NAME = 'Capacity_C09';
var LOG_SHEET    = PROJECT_NAME + '_GirisLoglari';
var TIMEOUT_MIN  = 10;

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
    var data  = sheet.getDataRange().getValues();
    for (var i = data.length - 1; i >= 1; i--) {
      if (data[i][0] === sessionId && data[i][5] === 'Açık') {
        sheet.getRange(i + 1, 4).setValue(new Date(exitTimestamp));
        sheet.getRange(i + 1, 5).setValue(Math.round(durationSec / 60 * 10) / 10);
        sheet.getRange(i + 1, 6).setValue('Tamamlandı');
        break;
      }
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
    var folder = DriveApp.getFolderById('1X2jhb_li2c-WxKBld8p3GHUeZMwuOR_H');
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
  const CACHE_KEY = 'spreadsheet_data_v31';
  const cache = CacheService.getScriptCache();
  const cached = cache.get(CACHE_KEY);
  if (cached) {
    try {
      const result = JSON.parse(cached);
      // DMF/PFW istatistiklerini her zaman sheet'ten canlı güncelle (cache'i bypass et)
      const summarySs = SpreadsheetApp.openById('1Lx2IniscO0hfdnZi12chv24dooB_pePJtUjKolB97C0');
      const summarySheet = summarySs.getSheetByName('MTP_summary');
      if (summarySheet && result.lineStats) {
        const freshStats = readDmfPfwStats(summarySheet);
        Object.keys(freshStats).forEach(function(k) { result.lineStats[k] = freshStats[k]; });
      }
      return result;
    } catch (e) { /* cache bozuk, devam et */ }
  }

  const mainSsId = '1SpLc32ad9K7HEMUWdMDNMxIRkKe73qaK0Pxw4SZvARk';
  const summarySsId = '1Lx2IniscO0hfdnZi12chv24dooB_pePJtUjKolB97C0';

  try {
    const mainSs = SpreadsheetApp.openById(mainSsId);
    const summarySs = SpreadsheetApp.openById(summarySsId);
    
    const mtpSheet = mainSs.getSheetByName("MTP'27");
    const diagSheet = mainSs.getSheetByName('Diaphragm Line');
    const summarySheet = summarySs.getSheetByName('MTP_summary');
    
    if (!mtpSheet || !diagSheet || !summarySheet) {
      throw new Error("Gerekli sekmelerden biri bulunamadı.");
    }
    
    // 1. HAT BAZLI KAPASİTE VERİLERİ (TÜM BOŞLUKLARI SİLEREK VE BÜYÜK HARFLE EŞLE)
    const summaryLastRow = Math.max(summarySheet.getLastRow(), 2);
    const summaryRaw = summarySheet.getRange(2, 1, summaryLastRow - 1, 14).getValues();
    const lineStatsMap = {};
    
    summaryRaw.forEach((row) => {
      const rawName = String(row[4] || row[3] || '');
      const fullKey = rawName.replace(/[^A-Z0-9]/gi, '').toUpperCase();
      const stripKey = normLineName(rawName);
      if (fullKey) {
        const val = {
          cycleTime: row[6] || '-',
          trp: row[7] || '-',
          shiftDay: row[8] || '-',
          annualCapacity: Number(row[13]) || 0
        };
        lineStatsMap[fullKey] = val;
        if (stripKey && stripKey !== fullKey) lineStatsMap[stripKey] = val;
      }
    });

    // DMF/PFW de diğer hatlar gibi isimle okunur; isimle bulunamazsa eski sabit satırlara (70-73/75-78) düşer
    Object.assign(lineStatsMap, readDmfPfwStats(summarySheet));

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
    // Aynı DMF birden çok PFW hattına gidebilir; tekil alanlar (kit kartı / SG / DP) son
    // satırı tutar, pfwLines ise tüm farklı PFW hatlarını biriktirir (PFW adedini bölmek için).
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
                          drivePlate: '', drivePlateLine: '', pfwLines: [] };
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
      });
    }

    // 4. E-DRIVE: ayrı dosyada "e-drive" sayfası → A=referans (A2+), B=hat/operasyon (B2+)
    //    Referanslar taban no + operasyon ekiyle gelir (örn. 75237B, 75237H, 75237IS).
    //    Aynı taban no, bir e-Drive parçasının tüm operasyon hatlarını temsil eder.
    const eDriveData = [];
    const eDriveRefSet = {};       // TAM ref (büyük harf) -> true  (MAIN O sütunu ile eşleştirme)
    const eDriveBaseToLines = {};  // taban no -> [ham hat adları]
    try {
      const eDriveSheet = SpreadsheetApp.openById('1pdPtUMFP8TYK8YCeEzIrSOZxL-Km7FzJBY5CXfLAU14').getSheetByName('e-drive');
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

    // 4b. E-DRIVE hat verileri (MTP_summary satır 100-103): E=hat, G/H/I, N=kapasite, S-W=2027-2031 adet
    const eDriveLineStats = {};
    try {
      summarySheet.getRange(100, 1, 4, 23).getValues().forEach(function(r) {
        const lineName = String(r[4] || '').trim();   // E
        const key = normLineName(lineName);
        if (!key) return;
        eDriveLineStats[key] = {
          lineName:       lineName,
          cycleTime:      r[6]  || '-',           // G
          trp:            r[7]  || '-',           // H
          shiftDay:       r[8]  || '-',           // I
          annualCapacity: Number(r[13]) || 0,     // N
          v26: Number(r[18]) || 0,   // S — 2027
          v27: Number(r[19]) || 0,   // T — 2028
          v28: Number(r[20]) || 0,   // U — 2029
          v29: Number(r[21]) || 0,   // V — 2030
          v30: Number(r[22]) || 0    // W — 2031
        };
      });
    } catch(e) {}

    // Kapasite kartı OLAN e-Drive hatları (summary sırasıyla normalize anahtarlar)
    const eDriveCardOrder = Object.keys(eDriveLineStats);

    // 5. ANA MTP VERİLERİ
    const mtpLastRow = Math.max(mtpSheet.getLastRow(), 8);
    const mtpRaw = mtpSheet.getRange(8, 1, mtpLastRow - 7, 100).getValues();

    const formattedData = mtpRaw.map(row => {
      const rawDiaphragm = String(row[19] || '').trim();  // T sütunu
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

      const kitRef = String(row[14] || '').trim();  // O sütunu
      // E-Drive: kit O-ref'i e-drive dosyasında varsa, parçanın taban no'su üzerinden
      // tüm operasyon hatları bulunur; yalnızca kapasite kartı OLAN hatlar (summary
      // 100-103) summary sırasıyla nest edilmek üzere diziye konur.
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
        ppca: String(row[15] || '').trim(),       // P sütunu
        ppcaLine: String(row[16] || '').trim(),   // Q sütunu
        cover: String(row[17] || '').trim(),      // R sütunu
        coverLine: String(row[18] || '').trim(),  // S sütunu
        diaphragm: rawDiaphragm,                  // T sütunu
        diaphragmFurnace: diagFurnaceInfo,
        diaphragmLines: diagLines,
        disk: String(row[20] || '').trim(),       // U sütunu
        diskLine: String(row[21] || '').trim(),   // V sütunu
        diskFamilyGroup: String(row[28] || '').trim(),  // AC sütunu
        dmf: String(row[22] || '').trim(),        // W sütunu
        dmfLine: String(row[23] || '').trim(),    // X sütunu
        eDriveLines: eDriveLines,
        familyGroup: String(row[27] || '').trim(),  // AB sütunu
        customer: String(row[6]  || '').trim(),     // G sütunu — Müşteri bilgisi
        customerName: String(row[7]  || '').trim(), // H sütunu — Müşteri tanımı
        customerCountry: String(row[13] || '').trim(), // N sütunu — Müşteri ülkesi
        customerFlag: countryFlagUrl(row[13]),         // N sütunundan üretilen bayrak görseli
        vol26: Number(row[91]) || 0,   // CN — 2027
        vol27: Number(row[92]) || 0,   // CO — 2028
        vol28: Number(row[93]) || 0,   // CP — 2029
        vol29: Number(row[94]) || 0,   // CQ — 2030
        vol30: Number(row[95]) || 0    // CR — 2031
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

// DMF/PFW hat istatistikleri: önce isimle (DMF1-4 / PFW1-4), bulunamazsa eski sabit satırlardan (70-73 / 75-78)
function readDmfPfwStats(sheet) {
  const stats = {};
  if (!sheet) return stats;
  const fixedLineNames = [['DMF1','DMF2','DMF3','DMF4'], ['PFW1','PFW2','PFW3','PFW4']];
  const dmfPfwKeys = { DMF1:1, DMF2:1, DMF3:1, DMF4:1, PFW1:1, PFW2:1, PFW3:1, PFW4:1 };
  try {
    const lastRow = Math.max(sheet.getLastRow(), 2);
    const data = sheet.getRange(2, 1, lastRow - 1, 14).getValues();
    data.forEach(function(row) {
      const key = normLineName(row[4]);
      if (dmfPfwKeys[key]) {
        stats[key] = {
          cycleTime:      row[6] || '-',
          trp:            row[7] || '-',
          shiftDay:       row[8] || '-',
          annualCapacity: Number(row[13]) || 0
        };
      }
    });
  } catch(e) {}
  [70, 75].forEach(function(startRow, gi) {
    try {
      sheet.getRange(startRow, 7, 4, 8).getValues().forEach(function(r, i) {
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
  const summarySsId = '1Lx2IniscO0hfdnZi12chv24dooB_pePJtUjKolB97C0';
  try {
    const sheet = SpreadsheetApp.openById(summarySsId).getSheetByName('MTP_summary');
    return readDmfPfwStats(sheet);
  } catch(e) {
    return {};
  }
}

function clearCache() {
  CacheService.getScriptCache().remove('spreadsheet_data_v31');
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
  const summarySsId = '1Lx2IniscO0hfdnZi12chv24dooB_pePJtUjKolB97C0';
  const sheet = SpreadsheetApp.openById(summarySsId).getSheetByName('MTP_summary');
  const lastRow = sheet.getLastRow();
  const allData = sheet.getRange(2, 1, lastRow - 1, 14).getValues();

  Logger.log('=== MTP_summary içinde DMF key üreten TÜM satırlar ===');
  allData.forEach((row, idx) => {
    const rowNum = idx + 2;
    const rawName = String(row[4] || row[3] || '');
    const key = normLineName(rawName);
    if (key.startsWith('DMF')) {
      Logger.log('Satır ' + rowNum + ': D=' + row[3] + ' E=' + row[4] + ' key=' + key +
        ' CT=' + row[6] + ' TRP=' + row[7] + ' SD=' + row[8] + ' Cap=' + row[13]);
    }
  });
  Logger.log('=== Explicit blok (D70:N73) ===');
  sheet.getRange(70, 4, 4, 11).getValues().forEach((r, i) => {
    Logger.log('Satır ' + (70+i) + ': D=' + r[0] + ' CT=' + r[3] + ' TRP=' + r[4] + ' Cap=' + r[10]);
  });
}

// PFW teşhisi: PFW2 adetleri nereye gidiyor? (çakışma / eşleşmeme tespiti)
function debugPFW() {
  const mainSsId = '1SpLc32ad9K7HEMUWdMDNMxIRkKe73qaK0Pxw4SZvARk';
  const mainSs   = SpreadsheetApp.openById(mainSsId);
  const pfwSheet = mainSs.getSheetByName('PFW');
  const mtpSheet = mainSs.getSheetByName("MTP'27");

  // 1) MAIN ürünlerinden DMF ref -> 5 yıl toplam adet
  const mtpLastRow = Math.max(mtpSheet.getLastRow(), 8);
  const mtpRaw = mtpSheet.getRange(8, 1, mtpLastRow - 7, 100).getValues();
  const volByDmf = {};
  mtpRaw.forEach(row => {
    const dmf = String(row[22] || '').trim().toUpperCase();   // W
    if (!dmf) return;
    const v = (Number(row[91])||0)+(Number(row[92])||0)+(Number(row[93])||0)+(Number(row[94])||0)+(Number(row[95])||0);
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