const fs = require('fs');
// Apps Script global stubs
global.PropertiesService = { getScriptProperties: () => ({ getProperties: () => ({}), getProperty: () => null, setProperty: () => {} }) };
global.Logger = { log: () => {} };
global.CacheService = { getScriptCache: () => ({ get:()=>null, getAll:()=>({}), put:()=>{}, putAll:()=>{}, removeAll:()=>{} }) };
global.Utilities = { sleep: () => {}, getUuid: () => 'uuid', formatDate: () => '2026-01-01' };
global.Session = { getScriptTimeZone: () => 'Europe/Istanbul', getActiveUser: () => ({ getEmail: () => 'a@b.c' }) };
global.SpreadsheetApp = {}; global.DriveApp = {}; global.MailApp = {}; global.ScriptApp = {}; global.LockService = {}; global.HtmlService={}; global.ContentService={};

const src = fs.readFileSync('Code.gs', 'utf8');
eval(src);

let fails = 0;
const ok = (cond, msg) => { console.log((cond ? '  ok   ' : '  FAIL ') + msg); if (!cond) fails++; };

// ── resolveMtpColumns ────────────────────────────────────────────────────────
const headers = new Array(92).fill('');
headers[5]='Customer'; headers[6]='Customer Name'; headers[12]='Country';
headers[26]='PPCA Line'; headers[27]='PPCA'; headers[28]='Family Group';
headers[29]='Disc Line'; headers[30]='Disc'; headers[31]='Disc Family Group';
headers[32]='DMF Line'; headers[33]='DMF'; headers[36]='Diaphragm';
headers[37]='Cover'; headers[38]='Cover Line'; headers[40]='Kit';
headers[82]='2027'; headers[83]='2028'; headers[84]='2029'; headers[85]='2030'; headers[86]='2031';
const mkSheet = (hdr) => ({ getLastColumn: () => hdr.length, getRange: () => ({ getValues: () => [hdr] }) });

let r = resolveMtpColumns(mkSheet(headers));
ok(r.ok && r.verified === 20, `sözleşme doğrulandı (verified=${r.verified}/20)`);
ok(r.cols.vol26 === 82 && r.cols.kit === 40, 'indeksler beklendiği gibi');
ok(r.warnings.length === 0, 'kayma yok → uyarı yok');

// bir sütun eklenmiş: her şey 1 kayıyor
const shifted = [''].concat(headers.slice(0, 91));
r = resolveMtpColumns(mkSheet(shifted));
ok(r.ok && r.cols.vol26 === 83 && r.cols.kit === 41, 'sütun eklenince indeksler otomatik kaydı');
ok(r.warnings.some(w => w.code === 'SCHEMA_SHIFTED'), 'kayma uyarısı üretildi');

// başlıklar tamamen yok
r = resolveMtpColumns(mkSheet(new Array(92).fill('')));
ok(!r.ok && r.warnings.some(w => w.code === 'SCHEMA_UNVERIFIED'), 'başlık yoksa veri gösterilmiyor');

// ── computeLineLoads: kapasite null semantiği ────────────────────────────────
const data = {
  globalData: [
    { kit:'K1', ppcaLine:'TB01 Etcoma', diskLine:'TD08 NX', dmfLine:'VD03 DMF1', dmf:'D1',
      vol26:100, vol27:100, vol28:100, vol29:100, vol30:100 },
    { kit:'K2', ppcaLine:'TB01 Etcoma', diskLine:'', dmfLine:'', dmf:'',
      vol26:50, vol27:50, vol28:50, vol29:50, vol30:50 }
  ],
  lineStats: {
    TB01ETCOMA: { annualCapacity: 100, lineName:'TB01 Etcoma', source:'MTP_summary!K5' },
    TD08NX:     { annualCapacity: null, lineName:'TD08 NX' },      // kapasite TANIMSIZ
    DMF1:       { annualCapacity: 500, lineName:'VD03 DMF1' }
  },
  eDriveLineStats: {},
  pfwMap: { D1: { pfwLines:['PFW1','PFW2'], sgLines:['SG1'], dpLines:[] } }
};
const loads = computeLineLoads(data);
const byName = {}; loads.forEach(l => byName[l.type + '|' + l.lineName] = l);

const ppca = byName['PPCA|TB01 Etcoma'];
ok(ppca && ppca.volumes[0] === 150, 'PPCA adetleri toplandı (100+50=150)');
ok(ppca && Math.round(ppca.occupancy[0]) === 150, 'doluluk %150 hesaplandı');

const disc = byName['Disc|TD08 NX'];
ok(disc && disc.capacity === null, 'kapasitesi tanımsız hat capacity=null');
ok(disc && disc.occupancy.every(p => p === null), 'kapasite yoksa doluluk null — %0 DEĞİL');
ok(disc && disc.volumes[0] === 100, 'adet yine de taşınıyor');

const pfw1 = byName['PFW|PFW1'];
ok(pfw1 && pfw1.volumes[0] === 50, 'PFW adedi 2 hatta eşit bölündü (100/2=50)');
ok(pfw1 && pfw1.split === true, 'bölme yapıldığı split bayrağıyla işaretlendi');
const sg1 = byName['SG|SG1'];
ok(sg1 && sg1.volumes[0] === 100 && sg1.split === false, 'tek hatlı SG bölünmedi');

// ── findOverloadedLines ──────────────────────────────────────────────────────
const hits = findOverloadedLines(loads, 100);
ok(hits.length === 1 && hits[0].line.lineName === 'TB01 Etcoma', 'yalnızca gerçekten aşan hat bulundu');
ok(hits[0].worstYear === '2027' && Math.round(hits[0].worstPct) === 150, 'en kötü yıl/yüzde doğru');
ok(!hits.some(h => h.line.lineName === 'TD08 NX'), 'kapasitesi tanımsız hat darboğaz sayılmadı');

// ── auditDataQuality ─────────────────────────────────────────────────────────
const q = auditDataQuality(data.globalData, data.lineStats, {});
ok(q.linesWithoutCapacity.length === 1 && q.linesWithoutCapacity[0].name === 'TD08 NX', 'kapasitesiz hat tespit edildi');
ok(q.totalRows === 2, 'satır sayısı doğru');

// duplicate kit
const q2 = auditDataQuality([{kit:'A',ppcaLine:'X'},{kit:'A',ppcaLine:'X'},{kit:'B',ppcaLine:'X'}], {X:{annualCapacity:1}}, {});
ok(q2.duplicateKits.length === 1 && q2.duplicateKits[0].kit === 'A' && q2.duplicateKits[0].rows === 2, 'çift kayıtlı kit bulundu');

// ── readDmfPfwStats fallback flag ────────────────────────────────────────────
const summaryRows = [['','', 'DMF1', 10, 0.8, 3, '','','','', 1000, '','','']];
const fakeSheet = { getLastRow: () => 2, getRange: () => ({ getValues: () => [[1,2,3,4,5,6,7,8],[1,2,3,4,5,6,7,8],[1,2,3,4,5,6,7,8],[1,2,3,4,5,6,7,8]] }) };
const st = readDmfPfwStats(fakeSheet, summaryRows);
ok(st.DMF1 && st.DMF1.annualCapacity === 1000 && !st.DMF1.estimated, 'isimle bulunan DMF1 tahmini DEĞİL');
ok(st.DMF2 && st.DMF2.estimated === true, 'yedek bloktan gelen DMF2 estimated:true ile işaretlendi');

// ── schema fingerprint stability ─────────────────────────────────────────────
ok(/^spreadsheet_data_v[a-z0-9]+$/.test(CACHE_KEY), 'önbellek anahtarı şemadan türetildi: ' + CACHE_KEY);

console.log(fails === 0 ? '\nTÜM TESTLER GEÇTİ' : `\n${fails} TEST BAŞARISIZ`);
process.exit(fails === 0 ? 0 : 1);
