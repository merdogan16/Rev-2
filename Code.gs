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
  const mainSsId = '1k3Hkb9F0vwpXXR6un2CPWzShol0bjTM2TZXITt94pI0';
  const summarySsId = '1SmV8rQitLQaUdpCmpUqL_xNR0v4G8nZHNXwK_BeH354';
  
  try {
    const mainSs = SpreadsheetApp.openById(mainSsId);
    const summarySs = SpreadsheetApp.openById(summarySsId);
    
    const mtpSheet = mainSs.getSheetByName('OYKU');
    const diagSheet = mainSs.getSheetByName('Diaphragm Line');
    const summarySheet = summarySs.getSheetByName('MTP_summary');
    
    if (!mtpSheet || !diagSheet || !summarySheet) {
      throw new Error("Gerekli sekmelerden biri bulunamadı.");
    }
    
    // 1. HAT BAZLI KAPASİTE VERİLERİ (TÜM BOŞLUKLARI SİLEREK VE BÜYÜK HARFLE EŞLE)
    const summaryLastRow = Math.max(summarySheet.getLastRow(), 2);
    const summaryRaw = summarySheet.getRange(2, 1, summaryLastRow - 1, 14).getValues();
    const lineStatsMap = {};
    
    summaryRaw.forEach(row => {
      const rawName = String(row[4] || '');
      // .replace(/\s+/g, '') kodu metindeki BÜTÜN boşlukları siler.
      const lineName = rawName.replace(/\s+/g, '').toUpperCase(); 
      if (lineName) {
        lineStatsMap[lineName] = {
          cycleTime: row[6] || '-',
          trp: row[7] || '-',
          shiftDay: row[8] || '-',
          annualCapacity: Number(row[13]) || 0
        };
      }
    });

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
        diagMap[baseDiagId] = activeData.join(', ');
      }
    }
    
    // 3. ANA MTP VERİLERİ
    const mtpLastRow = Math.max(mtpSheet.getLastRow(), 2);
    const mtpRaw = mtpSheet.getRange(2, 1, mtpLastRow - 1, 100).getValues();
    
    const formattedData = mtpRaw.map(row => {
      const rawDiaphragm = String(row[17] || '').trim();
      let diagFurnaceInfo = '-';
      if (rawDiaphragm) {
        const upperDiag = rawDiaphragm.toUpperCase();
        if (upperDiag.endsWith('C')) diagFurnaceInfo = 'Satınalma Komponent';
        else if (upperDiag.endsWith('Y')) {
          const baseId = upperDiag.slice(0, -1);
          diagFurnaceInfo = diagMap[baseId] ? diagMap[baseId] : '-';
        } else diagFurnaceInfo = diagMap[upperDiag] ? diagMap[upperDiag] : '-';
      }
      
      return {
        kit: String(row[13] || '').trim(),
        ppca: String(row[14] || '').trim(),
        ppcaLine: String(row[15] || '').trim(),
        cover: String(row[16] || '').trim(),
        diaphragm: rawDiaphragm,
        diaphragmFurnace: diagFurnaceInfo,
        disk: String(row[18] || '').trim(),
        diskLine: String(row[19] || '').trim(),
        dmf: String(row[20] || '').trim(),
        dmfLine: String(row[21] || '').trim(),
        familyGroup: String(row[26] || '').trim(),
        customer: String(row[1]  || '').trim(),
        customerDetail: String(row[2]  || '').trim(),
        customerName: String(row[3]  || '').trim(),
        vol26: Number(row[90]) || 0,
        vol27: Number(row[91]) || 0,
        vol28: Number(row[92]) || 0,
        vol29: Number(row[93]) || 0,
        vol30: Number(row[94]) || 0
      };
    }).filter(item => item.kit !== '');

    // 4. DMF LINE DATA
    const dmfNamesRaw = summarySheet.getRange(70, 4, 4, 1).getValues();
    const dmfCapRaw   = summarySheet.getRange(70, 14, 4, 1).getValues();

    // BG-BK (indices 58-62) = 2026-2030 DMF üretim adetleri, dmfLine (index 21) bazında topla
    const dmfLineQtyMap = {};
    mtpRaw.forEach(row => {
      const dmfLine = String(row[21] || '').trim();
      if (!dmfLine) return;
      dmfLine.split('/').map(p => p.trim()).filter(p => p).forEach(part => {
        const key = part.replace(/\s+/g, '').toUpperCase();
        if (!dmfLineQtyMap[key]) dmfLineQtyMap[key] = {qty26:0,qty27:0,qty28:0,qty29:0,qty30:0};
        dmfLineQtyMap[key].qty26 += Number(row[58]) || 0;
        dmfLineQtyMap[key].qty27 += Number(row[59]) || 0;
        dmfLineQtyMap[key].qty28 += Number(row[60]) || 0;
        dmfLineQtyMap[key].qty29 += Number(row[61]) || 0;
        dmfLineQtyMap[key].qty30 += Number(row[62]) || 0;
      });
    });

    const dmfLineData = {};
    for (let i = 0; i < 4; i++) {
      const rawName = String(dmfNamesRaw[i][0] || '').trim();
      if (!rawName) continue;
      const key = rawName.replace(/\s+/g, '').toUpperCase();
      const cap = Number(dmfCapRaw[i][0]) || 0;
      const qtys = dmfLineQtyMap[key] || {qty26:0,qty27:0,qty28:0,qty29:0,qty30:0};
      const toOcc = qty => cap > 0 ? (qty / cap * 100) : 0;
      dmfLineData[key] = {
        name: rawName,
        annualCapacity: cap,
        occ26: toOcc(qtys.qty26), occ27: toOcc(qtys.qty27),
        occ28: toOcc(qtys.qty28), occ29: toOcc(qtys.qty29),
        occ30: toOcc(qtys.qty30),
        qty26: qtys.qty26, qty27: qtys.qty27,
        qty28: qtys.qty28, qty29: qtys.qty29,
        qty30: qtys.qty30
      };
    }

    return {
      globalData: formattedData,
      lineStats: lineStatsMap,
      dmfLineData: dmfLineData
    };
    
  } catch (error) {
    return { error: error.toString() };
  }
}