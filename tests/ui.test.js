const fs = require('fs');
// jsdom bu depoda bağımlılık olarak tutulmuyor; test edecek geliştirici kurar:
//   npm install jsdom
const { JSDOM } = require('jsdom');

let html = fs.readFileSync(require('path').join(__dirname, '..', 'Index.html'), 'utf8');
// Apps Script şablon değişkenlerini doldur (sunucu tarafında yapılıyor)
html = html.replace('<?= sessionId ?>', 'test-session')
           .replace('<?= timeoutMin ?>', '10')
           .replace('<?= execUrl ?>', 'https://example.test/exec');
// Dış CDN betiklerini kaldır (ağ yok); grafiksiz degrade yolu test edilir
html = html.replace(/<script defer src="https:\/\/cdn[^>]*><\/script>/g, '');

// Sahte veri: kapasitesi TANIMLI, TANIMSIZ ve TAHMİNİ hatlar bir arada
const fakeData = {
  globalData: [
    { kit:'11111', ppca:'P1', ppcaLine:'TB01 Etcoma', disk:'D1', diskLine:'TD08 NX',
      dmf:'M1', dmfLine:'VD03 DMF1', cover:'C1', coverLine:'CL1', diaphragm:'DIA1',
      diaphragmFurnace:'-', diaphragmLines:[], diskFamilyGroup:'DFG1', familyGroup:'FG1',
      eDriveLines:[], customer:'CUST1', customerName:'Müşteri Bir', customerCountry:'Almanya',
      customerFlag:'', vol26:150, vol27:160, vol28:170, vol29:180, vol30:190 },
    { kit:'22222', ppca:'P2', ppcaLine:'TB02 Manuel 1', disk:'D2', diskLine:'TD08 NX',
      dmf:'M2', dmfLine:'VD03 DMF2', cover:'', coverLine:'', diaphragm:'',
      diaphragmFurnace:'-', diaphragmLines:[], diskFamilyGroup:'', familyGroup:'',
      eDriveLines:[], customer:'CUST2', customerName:'Müşteri İki', customerCountry:'Fransa',
      customerFlag:'', vol26:50, vol27:50, vol28:50, vol29:50, vol30:50 }
  ],
  lineStats: {
    TB01ETCOMA: { lineName:'TB01 Etcoma', cycleTime:12, trp:0.85, shiftDay:3, annualCapacity:100, source:'MTP_summary!K5' },
    TB02MANUEL1:{ lineName:'TB02 Manuel 1', cycleTime:20, trp:0.7, shiftDay:2, annualCapacity:null },  // TANIMSIZ
    TD08NX:     { lineName:'TD08 NX', cycleTime:15, trp:0.9, shiftDay:3, annualCapacity:500, source:'MTP_summary!K9' },
    DMF1:       { lineName:'VD03 DMF1', cycleTime:30, trp:0.8, shiftDay:3, annualCapacity:400, source:'MTP_summary!K50' },
    DMF2:       { lineName:'VD03 DMF2', cycleTime:30, trp:0.8, shiftDay:3, annualCapacity:120, estimated:true, source:'sabit yedek' }
  },
  eDriveData: [], eDriveLineStats: {},
  pfwMap: { M1: { pfw:'PF1', pfwLine:'PFW1', springGuide:'SG1', springGuideLine:'SGL1',
                  drivePlate:'', drivePlateLine:'', pfwLines:['PFW1','PFW2'], pfwPairs:[{ref:'PF1',line:'PFW1'}],
                  sgLines:['SGL1'], sgPairs:[{ref:'SG1',line:'SGL1'}], dpLines:[], dpPairs:[] } },
  lineDocs: {},
  quality: { linesWithoutCapacity:[{key:'TB02MANUEL1',name:'TB02 Manuel 1',types:'PPCA'}],
             unusedLines:[], duplicateKits:[], duplicateKitTotal:0, totalLines:4, totalRows:2 },
  schema: { verified: 20, total: 20 },
  thresholds: { warn:101, crit:115 },
  warnings: [{ code:'CAPACITY_MISSING', detail:'1 hattın kapasitesi tanımsız' }],
  readAt: Date.now(), fromCache: false
};

const errors = [];
const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  url: 'https://example.test/exec',
  beforeParse(win) {
    // Her zincir KENDİ handler'ını taşımalı: google.script.run bir builder'dır ve
    // arka arkaya iki çağrı yapıldığında (getSpreadsheetData + getEDriveImage)
    // tek bir paylaşılan handler kullanmak ikinci çağrının birincinin üzerine
    // yazmasına yol açar.
    const responses = {
      getSpreadsheetData: fakeData,
      getEDriveImage: { ok: false, code: 'IMAGE_READ' },
      getLayoutMap: { ok: true, map: {} },
      clearCache: { ok: true },
      logSearchTerm: undefined
    };
    function makeChain() {
      const state = { ok: null, fail: null };
      // Builder metotları PROXY'yi döndürmeli; ham nesneyi döndürmek zinciri kırar.
      const proxy = new Proxy(state, {
        get(target, prop) {
          if (prop === 'withSuccessHandler') return fn => { target.ok = fn; return proxy; };
          if (prop === 'withFailureHandler') return fn => { target.fail = fn; return proxy; };
          return (...args) => setTimeout(() => { if (target.ok) target.ok(responses[prop]); }, 0);
        }
      });
      return proxy;
    }
    win.google = { script: { get run() { return makeChain(); } } };
    win.HTMLCanvasElement.prototype.getContext = () => ({});
    // jsdom scrollIntoView'ı uygulamıyor (tarayıcıda vardır) — sahte bir tanım.
    win.Element.prototype.scrollIntoView = function () {};
    win.onerror = (m, s, l, c, e) => errors.push('window.onerror: ' + (e && e.stack ? e.stack : m));
    const origErr = win.console.error;
    win.console.error = (...a) => { errors.push('console.error: ' + a.join(' ')); origErr.apply(win.console, a); };
  }
});

const { window } = dom;
window.addEventListener('error', e => errors.push('error event: ' + (e.error ? e.error.stack : e.message)));

setTimeout(() => {
  const d = window.document;
  const q = sel => d.querySelector(sel);
  const txt = sel => (q(sel) || {}).textContent || '';
  let fails = 0;
  const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) fails++; };

  ok(errors.length === 0, 'çalışma zamanı hatası yok' + (errors.length ? '\n        ' + errors.slice(0,3).join('\n        ') : ''));

  // veri yüklendi mi
  ok(d.querySelectorAll('#kitSelect option').length === 3, 'kit listesi dolduruldu (2 kit + placeholder)');
  ok(!q('#emptyState').classList.contains('hidden'), 'boş ekran görünür');
  ok(txt('#occupancyLegend').includes('%100'), 'renk efsanesi çizildi');
  ok(!q('#warningsStrip').classList.contains('hidden'), 'veri uyarısı şeridi görünür');
  ok(txt('#warningsStrip').includes('kapasitesi tanımsız'), 'uyarı metni anlamlı');
  ok(txt('#freshness').includes('Veri okunma'), 'veri tazeliği gösteriliyor');
  ok(d.querySelectorAll('#linesList .line-item').length >= 4, 'hat listesi dolduruldu');
  ok(q('#bottleneckCount') && !q('#bottleneckCount').classList.contains('hidden'), 'darboğaz rozeti görünür');

  // KRİTİK: kapasitesi tanımsız hat için %0 yeşil GÖSTERİLMEMELİ
  window.renderCompSearchResults('tb02');
  const summary = txt('#cd-line-summary');
  ok(summary.includes('kapasite yok') || summary.includes('Kapasite tanımsız'),
     'kapasitesi tanımsız hat "kapasite yok" olarak işaretlendi');
  ok(!/%0(?!\d)/.test(summary.replace(/%100/g,'')), 'kapasitesiz hatta "%0" YAZILMIYOR');

  // kapasitesi tanımlı hat yüzde gösteriyor
  window.renderCompSearchResults('tb01');
  ok(txt('#cd-line-summary').includes('%150'), 'kapasiteli hat doluluğu %150 hesaplandı');

  // darboğaz ekranı
  window.renderBottleneck();
  ok(!q('#bottleneckView').classList.contains('hidden'), 'darboğaz ekranı açıldı');
  const bn = txt('#bottleneckBody');
  ok(bn.includes('TB01 Etcoma'), 'aşan hat listelendi');
  ok(!bn.includes('TB02 Manuel 1'), 'kapasitesi tanımsız hat darboğaz sayılmadı');
  ok(window.location.hash === '#darbogaz', 'URL durumu yazıldı: ' + window.location.hash);

  // what-if
  const btn = d.querySelector('.bn-line');
  if (btn) btn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  ok(!q('#whatIfPanel').classList.contains('hidden'), 'senaryo paneli açıldı');
  ok(txt('#whatIfBody').includes('Hesaplanan kapasite'), 'kapasite ilk ilkelerden hesaplandı');

  // veri kalitesi
  window.renderQuality();
  ok(!q('#qualityView').classList.contains('hidden'), 'veri kalitesi ekranı açıldı');
  ok(txt('#qualityBody').includes('TB02 Manuel 1'), 'kapasitesiz hat veri kalitesinde listelendi');
  ok(txt('#qualitySchemaLine').includes('20/20'), 'sütun sözleşmesi durumu gösteriliyor');

  // yardım
  window.renderHelp();
  ok(d.querySelectorAll('#helpBody details').length === 9, 'yardım kartı 9 soru içeriyor');

  // kit detayı + tahmini rozeti
  window.renderDetails('22222');
  ok(!q('#kitDetailView').classList.contains('hidden'), 'kit detayı açıldı');
  ok(txt('#m-cap').includes('tahmini'), 'sabit yedekten gelen kapasite "tahmini" işaretli');
  ok(txt('#p-cap').includes('Kapasite tanımsız'), 'kapasitesi olmayan PPCA hattı uyarı gösteriyor');

  // erişilebilirlik
  ok(d.querySelectorAll('.product-card[role="button"][tabindex="0"]').length === 4, '4 giriş kartı klavye erişilebilir');
  ok(q('#layoutModal').getAttribute('aria-modal') === 'true', 'modal aria-modal taşıyor');
  ok(d.querySelectorAll('[class*="focus-visible:ring"]').length > 10, 'odak halkaları uygulanmış');

  // tema kalıcılığı
  ok(html.includes("localStorage.setItem('dashTheme'"), 'tema tercihi saklanıyor');

  console.log(fails === 0 ? '\nTÜM ARAYÜZ TESTLERİ GEÇTİ' : `\n${fails} TEST BAŞARISIZ`);
  process.exit(fails === 0 ? 0 : 1);
}, 500);
