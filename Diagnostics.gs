// ─── Teşhis Fonksiyonları ─────────────────────────────────────────────────────
// Bu dosya üretim akışının parçası DEĞİLDİR: yalnızca Apps Script düzenleyicisinden
// elle çalıştırılan, "İcra günlüğü"ne çıktı yazan teşhis araçlarını içerir.
// (Eskiden Code.gs içindeydi ve backend'in ~%16'sını kaplıyordu.)

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