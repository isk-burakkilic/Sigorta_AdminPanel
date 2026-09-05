import { useEffect, useRef, useState, useCallback, lazy, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { policies, auth, resetCsrf, clearTabToken } from '../lib/api.js';
import { startIdleWatch } from '../lib/session.js';
import { useBackLevel, useBackTarget, goBack, installBackGuard, installEscGuard } from '../lib/backnav.js';
import { digitsOnly, idLimit, idLine } from '../lib/format.js';
import { toast } from '../lib/toast.jsx';
import Chatbot from '../components/Chatbot.jsx';
import Comparison from '../components/Comparison.jsx';
import PieChart from '../components/PieChart.jsx';
import ContactSearch from '../components/ContactSearch.jsx';
import TeklifPdf from '../components/TeklifPdf.jsx';
import Settings from '../components/Settings.jsx';
import TakipIsler from '../components/TakipIsler.jsx';
import NotificationBell from '../components/NotificationBell.jsx';
import UpcomingJobs from '../components/UpcomingJobs.jsx';
import ThemeToggle from '../components/ThemeToggle.jsx';
import HelpGuide from '../components/HelpGuide.jsx';
// Lazily loaded: pulls in the QR decoder only when the reader is opened.
const RuhsatReader = lazy(() => import('../components/RuhsatReader.jsx'));
// Lazily loaded: pulls in pdfjs + xlsx only when the tracker is opened.
const DisPoliceTakip = lazy(() => import('../components/DisPoliceTakip.jsx'));
// Lazily loaded: xlsx here, ExcelJS only once a report is actually generated.
const PolisoftCompare = lazy(() => import('../components/PolisoftCompare.jsx'));
// Grafikler — kendi SVG çizim ilkelleriyle gelir; ana sayfada gerekmez.
const Analytics = lazy(() => import('../components/Analytics.jsx'));
import { aggregate, toSlices, fmtTL } from '../lib/stats.js';
import { buildContacts, contactKey } from '../lib/contacts.js';
import { setTypeCategories, displayCategory, categoryNames } from '../lib/policyTypes.js';
import {
  compType, parseComparison, buildSaveNotlar, defaultKaskoRow, defaultTrafikRow,
} from '../lib/comparison.js';
import '../styles/panel.css';

// Auto-logout after this much inactivity. The REAL value comes from the server
// (/api/auth/session → idleMinutes, driven by SESSION_IDLE_MIN); this is only
// the fallback used until that response lands, so the two can never drift.
const IDLE_MINUTES_FALLBACK = 60;

const MONTHS_TR = ['', 'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
const STATUS = ['Çalışılmadı', 'Çalışıldı', 'Poliçelendirildi', 'İptal', 'Eksik Tahsilat', 'Yapılmayacak', 'Dış Teklif Bekleniyor'];

// Month-view table columns (sort key, header label)
const COLS = [
  ['bitis_tarihi', 'Bitiş Tarihi'], ['police_numarasi', 'Poliçe No'], ['hesap_adi', 'Hesap Adı'],
  ['arac_plakasi', 'Plaka'], ['produktor_tali_adi', 'Prodüktör'], ['sigorta_sirketi', 'Sigorta Şirketi'],
  ['police_turu', 'Poliçe Türü'], ['brut_tl', 'Brüt (TL)'], ['tc_kimlik_no', 'TC / Vergi No'],
  ['gsm_no', 'GSM'], ['belge_seri_no', 'Seri No'], ['brut_2026', 'Güncel Prim'], ['sistem_durum', 'Durum'],
];

// Alt toplam satırı "Brüt (TL)" sütununun altına hizalanır.
const BRUT_COL = COLS.findIndex(([k]) => k === 'brut_tl');

// Editor field grid — order matches the original form panel (4 columns).
const EDIT_FIELDS = [
  ['hesap_adi', 'Hesap Adı'], ['arac_plakasi', 'Araç Plakası'], ['sigorta_sirketi', 'Sigorta Şirketi'], ['police_turu', 'Poliçe Türü'],
  ['brut_tl', 'Brüt (TL)'], ['tc_kimlik_no', 'TC Kimlik No'], ['vergi_kimlik_no', 'Vergi Kimlik No'], ['gsm_no', 'GSM No'],
  ['dogum_tarihi', 'Doğum Tarihi'],
  ['belge_seri_no', 'Belge Seri No'], ['bitis_tarihi', 'Bitiş Tarihi'], ['police_numarasi', 'Poliçe Numarası'], ['produktor_tali_adi', 'Prodüktör / Tali'],
  ['brut_2026', 'Güncel Prim'],
];

// Auto-message generator — ported from the legacy generateAutoMessage().
// Şirket kayıtlarında TC yerine vergi numarası olur; etiket de ona göre değişir.
function genAutoMsg(rec) {
  const pType = String(rec.police_turu || '').toUpperCase();
  if (['701', '410', 'TRAFİK', 'TRAFIK', 'KASKO'].some((s) => pType.includes(s))) {
    const tur = (pType.includes('701') || pType.includes('KASKO')) ? 'Kasko' : 'Trafik';
    return `Merhaba, \n${tur} Poliçesi;\n\n${idLine(rec.tc_kimlik_no, rec.vergi_kimlik_no)}\nPlaka: ${rec.arac_plakasi || ''}\nBelge Seri No: ${rec.belge_seri_no || ''}\n\nİyi çalışmalar.`;
  }
  return '';
}

// Mandatory fields for a NEW record; TC or Vergi (at least one) checked separately.
const REQ_LABELS = { hesap_adi: 'Hesap Adı', bitis_tarihi: 'Bitiş Tarihi', police_turu: 'Poliçe Türü', sigorta_sirketi: 'Sigorta Şirketi' };
const REQUIRED = new Set(Object.keys(REQ_LABELS));
function validateNew(rec) {
  for (const [k, label] of Object.entries(REQ_LABELS)) {
    if (!String(rec[k] || '').trim()) return `${label} alanı zorunludur.`;
  }
  if (!String(rec.tc_kimlik_no || '').trim() && !String(rec.vergi_kimlik_no || '').trim()) {
    return 'TC Kimlik No veya Vergi Kimlik No alanlarından en az biri doldurulmalıdır.';
  }
  return null;
}
// Bitiş Tarihi <input type=date> value ⇄ stored DD.MM.YYYY.
const toDateInput = (v) => {
  const s = String(v || '').trim();
  let m = s.match(/^(\d{2})\.(\d{2})\.(\d{4})$/); if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return '';
};
const fromDateInput = (v) => { const m = String(v || '').match(/^(\d{4})-(\d{2})-(\d{2})$/); return m ? `${m[3]}.${m[2]}.${m[1]}` : v; };
// Keep an existing record's current value selectable even if it's not in the distinct list.
const withCurrent = (list, cur) => (cur && !list.includes(cur) ? [...list, cur] : list);

// Letter grade by renewal rate (done/total) — verbatim from the legacy panel.
function monthGrade(tot, done) {
  if (!tot) return null;
  const r = done / tot;
  if (r >= 0.95) return 'A+';
  if (r >= 0.88) return 'A';
  if (r >= 0.80) return 'B+';
  if (r >= 0.70) return 'B';
  if (r >= 0.58) return 'C+';
  if (r >= 0.45) return 'C';
  if (r >= 0.30) return 'D+';
  return 'D';
}

function MetricTile({ icon, tone, label, value }) {
  return (
    <div className="metric-tile">
      <div className={`metric-icon tone-${tone}`}>{icon}</div>
      <div className="metric-text">
        <div className="metric-label">{label}</div>
        <div className="metric-value">{value}</div>
      </div>
    </div>
  );
}

// Sidebar/topbar brand: the logged-in tenant's name, last word in gold
// (same treatment the old "Zenith Peak" wordmark had). Falls back to the
// product name until the session response arrives.
function TenantBrand({ name }) {
  if (!name) return <>Zenith <span>Peak</span></>;
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return <>{name}</>;
  const last = parts.pop();
  return <>{parts.join(' ')} <span>{last}</span></>;
}

// Üst bara sabitlenmiş Geri butonu. Bar `position: fixed` olduğu için sayfa
// ne kadar kaydırılırsa kaydırılsın buton hep aynı yerde durur. Hedefi geri
// yığınının en üstteki katmanı söyler (bkz. lib/backnav.js); kök ekranda
// pasif görünür ki bar hiçbir ekranda yerinden oynamasın.
function TopbarBack() {
  const target = useBackTarget();
  return (
    <button className="topbar-back" onClick={goBack} disabled={!target}
      title={target ? `${target.label} ekranına dön` : 'Ana sayfadasınız'}
      aria-label={target ? `Geri: ${target.label}` : 'Geri'}>
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor"
        strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M15 18l-6-6 6-6" />
      </svg>
      <span className="tb-back-label">{target ? target.label : 'Geri'}</span>
    </button>
  );
}

const statusClass = (s) => {
  const map = {
    'Çalışılmadı': 'calisilmadi', 'Çalışıldı': 'calisildi', 'Poliçelendirildi': 'policelendirildi',
    'İptal': 'iptal', 'Eksik Tahsilat': 'eksik', 'Yapılmayacak': 'yapilmayacak', 'Dış Teklif Bekleniyor': 'dis-teklif',
  };
  return 'status-badge status-' + (map[s] || 'calisilmadi');
};

// Ay görünümü poliçe türü filtresi.
// Acente Ayarlar → Poliçe Türleri → Kategoriler'den eşleme tanımladıysa filtre
// KATEGORİLERİ listeler ("Trafik Poliçesi" seçince 410 + TRAFİK + TRAFİK
// POLİÇESİ hepsi gelir). Henüz eşleme yoksa eski sabit kod listesine düşülür,
// böylece kategori kurmayan acentede davranış birebir aynı kalır.
const LEGACY_TYPE_OPTIONS = [
  ['410', '410 / Trafik'], ['701', '701 / Kasko'], ['722', '722'], ['956', '956'],
  ['718', '718'], ['800', '800'], ['TIBBI', 'TIBBİ KÖTÜ UYGULAMA'], ['KOBI', 'Kobi (İşyeri + KOBİ)'],
];
// Kategori filtresi değerleri "cat:" ile ön eklenir — bir kategori adı ile
// bir poliçe kodu ("722") aynı metin olsa bile karışmasın diye.
const CAT_PREFIX = 'cat:';
function typeOptions(cats) {
  if (!cats.length) return LEGACY_TYPE_OPTIONS;
  return cats.map((c) => [CAT_PREFIX + c, c]);
}
function matchType(policeTuru, type) {
  if (!type) return true;
  if (type.startsWith(CAT_PREFIX)) return displayCategory(policeTuru) === type.slice(CAT_PREFIX.length);
  const pt = (policeTuru || '').toLocaleUpperCase('tr-TR');
  if (type === 'TIBBI') return pt.includes('TIBBI');
  if (type === 'KOBI') return pt.includes('İŞYERİ') || pt.includes('IŞYERI') || pt.includes('KOBİ') || pt.includes('KOBI');
  if (type === '410') return pt.includes('410') || pt.includes('TRAFİK') || pt.includes('TRAFIK');
  if (type === '701') return pt.includes('701') || pt.includes('KASKO');
  return pt.includes(type.toLocaleUpperCase('tr-TR'));
}

// ── Display helpers (ported from the legacy panel) ───────────
function formatDate(val) {
  if (!val || val === '-') return val || '-';
  const s = String(val).trim();
  if (/^\d{2}\.\d{2}\.\d{4}$/.test(s)) return s;
  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    return String(d.getUTCDate()).padStart(2, '0') + '.' + String(d.getUTCMonth() + 1).padStart(2, '0') + '.' + d.getUTCFullYear();
  }
  return s;
}
function parseNum(s) {
  s = String(s ?? '').trim();
  if (!s) return NaN;
  if (/^-?\d+(\.\d+)?$/.test(s)) return parseFloat(s);
  return parseFloat(s.replace(/\./g, '').replace(',', '.'));
}
// "2026-02-27 14:30:00" -> "27.02.2026 14:30"
function formatDateTime(val) {
  if (!val) return '—';
  const s = String(val).trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
  if (m) return `${m[3]}.${m[2]}.${m[1]} ${m[4]}:${m[5]}`;
  return formatDate(val);
}
function formatCurrency(val) {
  if (val === undefined || val === null || val === '' || val === '-') return '-';
  const num = parseNum(val);
  if (isNaN(num)) return String(val);
  return num.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function dateToSortKey(d) {
  if (!d || !String(d).trim()) return 0;
  const s = String(d).trim();
  let m = s.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (m) return parseInt(m[3] + m[2] + m[1]);
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return parseInt(m[1] + m[2] + m[3]);
  return 0;
}

export default function Panel() {
  const nav = useNavigate();
  const [user, setUser] = useState('');
  const [tenantName, setTenantName] = useState('');
  const [tenantId, setTenantId] = useState('');   // aktif acente kimliği
  const [tenants, setTenants] = useState([]);     // girebildiği acenteler (sunucudan)
  const [sidebarOpen, setSidebarOpen] = useState(true); // open by default on the homepage
  const [view, setView] = useState('dashboard');          // dashboard | uretim | month | takip | …
  const [summary, setSummary] = useState({});              // keyed by month_num
  const [currentMonth, setCurrentMonth] = useState(null);
  const [records, setRecords] = useState([]);
  const [selectMode, setSelectMode] = useState(false);       // toplu seçim modu açık mı
  const [selected, setSelected] = useState(() => new Set()); // seçili kayıt id'leri
  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [sortKey, setSortKey] = useState('');
  const [sortAsc, setSortAsc] = useState(true);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [kaskoRows, setKaskoRows] = useState([]);
  const [trafikRows, setTrafikRows] = useState([]);
  // Kıyaslamadan "Teklife Aktar" ile seçilen tek satır (firma+fiyat+taksit).
  // Yalnızca Teklif PDF açılırken o firmanın alanını ön doldurur; başka hiçbir
  // şeye (notlar dahil) yazılmaz, kayıt değişince temizlenir.
  const [teklifPrefill, setTeklifPrefill] = useState(null);
  const [msgOpen, setMsgOpen] = useState(false); // Otomatik Mesaj panel collapsed by default
  const [sync, setSync] = useState({ state: 'syncing', text: 'Bağlanıyor...' });
  const [stats, setStats] = useState(null);
  const [teklif, setTeklif] = useState(null); // teklif belgesi açık olan kayıt
  const [contactsOpen, setContactsOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [helpSection, setHelpSection] = useState('genel');
  const [contacts, setContacts] = useState(null); // null = not loaded yet
  const [options, setOptions] = useState({ companies: [], types: [] }); // dropdown values from Excel data
  const [typeCats, setTypeCats] = useState([]); // tanımlı poliçe türü kategorileri (ay filtresi için)
  const [idleMinutes, setIdleMinutes] = useState(IDLE_MINUTES_FALLBACK);

  useEffect(() => {
    auth.session().then((s) => {
      setUser(s.user || '');
      setTenantName(s.tenantName || '');
      setTenantId(s.tenant || '');
      setTenants(Array.isArray(s.tenants) ? s.tenants : []);
      if (s.idleMinutes > 0) setIdleMinutes(s.idleMinutes); // sunucu neyi zorluyorsa o
    });
  }, []);

  // Acente değiştir — yalnızca sunucunun bu kullanıcıya açtığı acenteler
  // arasında (yönetici ise hepsi). Yetkiyi sunucu ayrıca doğrular.
  // Değişimden sonra sayfa yenilenir: her ekran kendi verisini yeni acentenin
  // veritabanından çeksin, eski acentenin kayıtları ekranda kalmasın.
  const switchTenant = useCallback(async (id) => {
    if (!id || id === tenantId) return;
    const r = await auth.switchTenant(id);
    if (r.ok) window.location.reload();
    else toast(r.error || 'Acente değiştirilemedi.', 'err');
  }, [tenantId]);

  const loadStats = useCallback(async () => {
    const r = await policies.stats();
    if (r.ok) setStats(aggregate(r.data));
  }, []);
  useEffect(() => { loadStats(); }, [loadStats]);

  // Distinct Sigorta Şirketi / Poliçe Türü values for the editor dropdowns.
  const loadOptions = useCallback(async () => {
    const r = await policies.options();
    if (r.ok) setOptions({
      companies: [...r.data.companies].sort((a, b) => a.localeCompare(b, 'tr')),
      types: [...r.data.types].sort((a, b) => a.localeCompare(b, 'tr')),
    });
    // Poliçe türü kategorileri modül seviyesindeki kayıt defterine yüklenir;
    // grafikler (stats.js) ve teklif formu seçimi (comparison.js) saf
    // fonksiyonlar olduğu için React prop'u ile beslenemez.
    const c = await policies.typeCategories();
    if (c.ok) { setTypeCategories(c.data); setTypeCats(categoryNames()); }
  }, []);
  useEffect(() => { loadOptions(); }, [loadOptions]);

  const loadSummary = useCallback(async () => {
    setSync({ state: 'syncing', text: 'Yükleniyor...' });
    const r = await policies.monthSummary();
    if (r.ok) {
      const map = {};
      r.data.forEach((row) => { if (Number(row.month_num) > 0) map[Number(row.month_num)] = row; });
      setSummary(map);
      setSync({ state: 'ok', text: 'Canlı' });
    } else {
      setSync({ state: 'error', text: 'Bağlantı hatası' });
    }
  }, []);

  useEffect(() => { loadSummary(); }, [loadSummary]);

  // When the policy type is Kasko/Trafik and no rows exist yet, seed one (legacy behaviour).
  const ctype = editing ? compType(editing.police_turu) : null;
  // DASK (800) poliçelerinde adres ayrı bir alan — eskiden notlar'a yazılırdı.
  const isDask = editing
    ? (String(editing.police_turu ?? '').trim() === '800' || displayCategory(editing.police_turu) === 'DASK')
    : false;
  useEffect(() => {
    if (ctype === 'kasko' && kaskoRows.length === 0) setKaskoRows([defaultKaskoRow()]);
    if (ctype === 'trafik' && trafikRows.length === 0) setTrafikRows([defaultTrafikRow()]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctype]);

  async function showMonth(m) {
    setCurrentMonth(m); setView('month'); setSidebarOpen(false); setQ(''); setStatusFilter(''); setTypeFilter(''); setSortKey('');
    setSelectMode(false); setSelected(new Set());
    setSync({ state: 'syncing', text: `${MONTHS_TR[m]} yükleniyor...` });
    const r = await policies.byMonth(m);
    if (r.ok) { setRecords(r.data); setSync({ state: 'ok', text: `${MONTHS_TR[m]} — ${r.data.length} kayıt` }); }
    else setSync({ state: 'error', text: 'Yükleme hatası' });
  }

  function showDashboard() { setView('dashboard'); setSidebarOpen(true); }   // homepage → sidebar open
  function showUretim() { setView('uretim'); loadSummary(); setSidebarOpen(false); } // other pages → closed
  function showSettings() { setView('settings'); setSidebarOpen(false); }
  function showRuhsat() { setView('ruhsat'); setSidebarOpen(false); }
  function showDisPolice() { setView('dispolice'); setSidebarOpen(false); }
  function showPolisoftCompare() { setView('polisoftcompare'); setSidebarOpen(false); }
  function showTakip() { setView('takip'); setSidebarOpen(false); }
  function showGrafikler() { setView('grafikler'); setSidebarOpen(false); }
  function openHelp(section = 'genel') { setHelpSection(section); setHelpOpen(true); }

  // ── Geri yığını ──
  // Ana Sayfa köktür; her ekran ve üstüne binen her katman kendi geri adımını
  // kaydeder. Üst bardaki Geri butonu ile tarayıcının/telefonun geri tuşu aynı
  // yığını kullanır, böylece ikisi de aynı yere götürür.
  useBackLevel(view !== 'dashboard', view === 'month' ? 'Üretim Listesi' : 'Ana Sayfa',
    () => { if (view === 'month') showUretim(); else showDashboard(); });
  // Dar ekranda kenar çubuğu içeriğin üstünü karartarak açılır — bir katmandır,
  // geri tuşu önce onu kapatmalı. Geniş ekranda çubuk içeriği ittiği için değil.
  const [narrow, setNarrow] = useState(() => window.matchMedia('(max-width: 820px)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 820px)');
    const onChange = (e) => setNarrow(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  useBackLevel(narrow && sidebarOpen, 'Panel', () => setSidebarOpen(false));

  useBackLevel(contactsOpen, 'Panel', () => setContactsOpen(false));
  useBackLevel(helpOpen, 'Panel', () => setHelpOpen(false));
  useBackLevel(!!editing, 'Kayıt Listesi', () => setEditing(null));
  useBackLevel(!!teklif, 'Kayıt', () => setTeklif(null));

  // Tarayıcı/telefon geri tuşu siteden atmasın: bir adım uygulama içinde geri
  // gitsin. Kök ekranda yapacak bir şey yoksa kullanıcıyı sekmeye bağlı
  // oturumdan düşürmek yerine kısa bir uyarı gösteriyoruz.
  const backHintRef = useRef(0);
  useEffect(() => installBackGuard(() => {
    if (Date.now() - backHintRef.current < 4000) return;
    backHintRef.current = Date.now();
    toast('Ana sayfadasınız. Oturumu kapatmak için menüdeki “Çıkış Yap”ı kullanın.', 'info', 4000);
  }), []);
  useEffect(() => installEscGuard(), []);

  async function openRecord(id) {
    setMsgOpen(false);
    setTeklifPrefill(null);
    const r = await policies.get(id);
    if (r.ok) {
      const rec = { ...r.data };
      const parsed = parseComparison(rec.notlar); // pull KASKO_JSON/TRAFIK_JSON out
      rec.notlar = parsed.display;                // textarea shows the human block only
      setKaskoRows(parsed.kaskoRows);
      setTrafikRows(parsed.trafikRows);
      setEditing(rec);
    } else toast(r.error || 'Kayıt açılamadı', 'err');
  }
  function newRecord() { setKaskoRows([]); setTrafikRows([]); setTeklifPrefill(null); setMsgOpen(false); setEditing({ id: null, sistem_durum: 'Çalışılmadı' }); }

  async function openContactSearch() {
    setContactsOpen(true);
    if (contacts === null) {
      try {
        const r = await policies.contacts();
        if (r.ok) setContacts(buildContacts(r.data));
        else { setContacts([]); toast('Kişiler yüklenemedi: ' + (r.error || 'bilinmeyen hata') + '. Sunucuyu yeniden başlatın.', 'err', 7000); }
      } catch {
        setContacts([]); toast('Kişiler yüklenemedi. Sunucunun çalıştığından emin olun.', 'err', 7000);
      }
    }
  }
  // Poliçe, Kontak Arama içinden açıldığında panel KAPANMAZ — düzenleyici
  // üstüne biner. Kapatınca kullanıcı bıraktığı Müşteri 360 ekranına döner.
  function openPolicyFromContact(id) { openRecord(id); }

  // Kontak listesini geçersiz kıl. Kontak Arama açıkken hemen yeniden çekilir:
  // arkada açık duran Müşteri 360 ekranı güncel poliçelerle devam etsin.
  const reloadContacts = useCallback(async () => {
    const r = await policies.contacts();
    setContacts(r.ok ? buildContacts(r.data) : []);
  }, []);
  function invalidateContacts() { if (contactsOpen) reloadContacts(); else setContacts(null); }

  // Comparison change handlers. Fiyat/teminat alanları kendi state'lerinde
  // (kaskoRows/trafikRows/editing[key]) tutulur ve JSON olarak KAYIT ANINDA
  // notlar'a eklenir (buildSaveNotlar, save() içinde) — düzenleme sırasında
  // notlar'a DOKUNULMAZ. Eskiden her fiyat/teminat değişiminde notlar canlı
  // olarak yeniden üretiliyordu; bu, kullanıcının (veya bir meslektaşının)
  // elle yazdığı metni sessizce siliyordu. Bkz. docs/ altındaki not.
  const onKasko = (rows) => setKaskoRows(rows);
  const onTrafik = (rows) => setTrafikRows(rows);
  const on722 = (key, val) => setEditing((s) => ({ ...s, [key]: val }));

  // Kıyaslama satırındaki "➜" ile seçilen TEK firma+fiyat+taksit — Teklif PDF
  // açıldığında yalnızca o firmanın alanını ön doldurur (diğer şirketler boş kalır).
  function sendToTeklif(firma, fiyat, taksit) {
    setTeklifPrefill({ firma, fiyat, taksit });
    toast(`${firma} fiyatı Teklif PDF'e aktarıldı.`, 'ok');
  }

  async function save() {
    if (!editing.id) {                       // strict mandatory-field check for new records
      const err = validateNew(editing);
      if (err) { toast(err, 'err', 5000); return; }
      // Duplicate customer guard — same TC + Name already registered?
      const cr = await policies.contacts();
      if (cr.ok) {
        const key = contactKey(editing.tc_kimlik_no, editing.hesap_adi);
        if (buildContacts(cr.data).some((c) => c.key === key)) {
          toast('Bu müşteri (TC + İsim) zaten kayıtlı. Kontak Arama ile bulabilirsiniz.', 'err', 6000);
          return;
        }
      }
    }
    setSaving(true);
    try {
      const payload = { ...editing, notlar: buildSaveNotlar(editing, kaskoRows, trafikRows) };
      const r = await policies.save(payload);
      if (r.ok) { toast('Kayıt kaydedildi.', 'ok'); setEditing(null); if (currentMonth) showMonth(currentMonth); loadSummary(); loadStats(); invalidateContacts(); }
      else toast(r.error || 'Kaydedilemedi.', 'err', 6000);
    } catch { toast('Bağlantı hatası.', 'err'); } finally { setSaving(false); }
  }
  async function remove() {
    if (!editing?.id || !confirm('Bu kaydı silmek istediğinize emin misiniz?')) return;
    const r = await policies.remove(editing.id);
    if (r.ok) { toast('Kayıt silindi.', 'ok'); setEditing(null); if (currentMonth) showMonth(currentMonth); loadSummary(); loadStats(); invalidateContacts(); }
    else toast(r.error || 'Silinemedi.', 'err');
  }

  async function doExport() {
    const r = await policies.export();
    if (!r.ok) return toast('Dışa aktarılamadı.', 'err');
    const XLSX = await import('xlsx');
    const ws = XLSX.utils.json_to_sheet(r.data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Policeler');
    XLSX.writeFile(wb, 'policeler.xlsx');
  }
  async function doImport(e) {
    const file = e.target.files?.[0]; e.target.value = '';
    if (!file) return;
    const XLSX = await import('xlsx');
    const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
    const json = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
    if (!json.length) return toast('Dosyada satır bulunamadı.', 'err');
    // Excel stores dates as serial numbers (e.g. 46150). Convert the Bitiş Tarihi
    // column to DD.MM.YYYY so the month grouping can read it. Only that column is
    // touched, so numeric amounts (Brüt) are never mistaken for dates.
    const toDMY = (v) => {
      const n = typeof v === 'number' ? v : (/^\d{5}$/.test(String(v).trim()) ? Number(String(v).trim()) : null);
      if (n && n > 20000 && n < 60000) {
        const d = XLSX.SSF.parse_date_code(n);
        if (d && d.y) return `${String(d.d).padStart(2, '0')}.${String(d.m).padStart(2, '0')}.${d.y}`;
      }
      return v;
    };
    json.forEach((row) => Object.keys(row).forEach((k) => { if (k.trim() === 'Bitiş Tarihi') row[k] = toDMY(row[k]); }));
    const r = await policies.import(json);
    if (r.ok) { toast(`${r.data.inserted} kayıt içe aktarıldı.`, 'ok'); loadSummary(); loadStats(); loadOptions(); setContacts(null); }
    else toast(r.error || 'İçe aktarılamadı.', 'err');
  }

  async function logout() { await auth.logout(); resetCsrf(); clearTabToken(); nav('/giris', { replace: true }); }

  // ── Session watchdog ──
  // Auto-logout after IDLE_MINUTES of no user activity, and react immediately
  // when the server drops the session (idle elsewhere / tab token no longer valid).
  useEffect(() => {
    const leave = (reason) => {
      clearTabToken();
      resetCsrf();
      nav(`/giris?reason=${reason}`, { replace: true });
    };
    const stop = startIdleWatch({
      idleMs: idleMinutes * 60 * 1000,
      onIdle: async () => { try { await auth.logout(); } catch { /* already gone */ } leave('idle'); },
      onBeat: () => { auth.heartbeat().catch(() => {}); },
    });
    const onLost = (e) => { stop(); leave(e.detail === 'idle' ? 'idle' : 'session'); };
    window.addEventListener('zp:auth-lost', onLost);
    return () => { stop(); window.removeEventListener('zp:auth-lost', onLost); };
  }, [nav, idleMinutes]);

  const closeSidebar = () => setSidebarOpen(false);
  const cm = new Date().getMonth() + 1;

  const isNewRec = (r) => r.is_manually_added == 1 || r.is_manually_added === '1';
  const toggleSel = (id) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const renderRow = (r, isNew = false) => (
    <tr key={r.id} data-status={r.sistem_durum}
      className={`${isNew ? 'new-rec' : ''}${selectMode && selected.has(r.id) ? ' row-selected' : ''}`}
      onClick={() => (selectMode ? toggleSel(r.id) : openRecord(r.id))}>
      {selectMode && (
        <td className="sel-cell" onClick={(e) => { e.stopPropagation(); toggleSel(r.id); }}>
          <input type="checkbox" checked={selected.has(r.id)} readOnly />
        </td>
      )}
      <td className="mono">{formatDate(r.bitis_tarihi) || '-'}</td>
      <td className="mono">{r.police_numarasi || '-'}</td>
      <td className="name-cell">{isNew && <span className="new-marker">✱</span>}{r.hesap_adi || '-'}</td>
      <td className="plate-cell">{r.arac_plakasi || '-'}</td>
      <td>{r.produktor_tali_adi || '-'}</td>
      <td>{r.sigorta_sirketi || '-'}</td>
      <td>{r.police_turu || '-'}</td>
      <td className="mono">{formatCurrency(r.brut_tl)}</td>
      <td className="mono" style={{ fontSize: '.72rem' }}>{r.tc_kimlik_no || r.vergi_kimlik_no || '-'}</td>
      <td className="mono">{r.gsm_no || '-'}</td>
      <td className="mono">{r.belge_seri_no || '-'}</td>
      <td className="mono">{formatCurrency(r.brut_2026)}</td>
      <td><span className={statusClass(r.sistem_durum)}>{r.sistem_durum || '?'}</span></td>
    </tr>
  );

  function sortBy(key) {
    if (sortKey === key) setSortAsc((a) => !a);
    else { setSortKey(key); setSortAsc(true); }
  }

  let filtered = records.filter((r) => {
    const term = q.trim().toLocaleUpperCase('tr-TR');
    const mt = !term || [r.hesap_adi, r.arac_plakasi, r.police_numarasi, r.produktor_tali_adi]
      .some((v) => (v || '').toLocaleUpperCase('tr-TR').includes(term));
    const ms = !statusFilter || r.sistem_durum === statusFilter;
    const mty = matchType(r.police_turu, typeFilter);
    return mt && ms && mty;
  });
  if (sortKey) {
    filtered = [...filtered].sort((a, b) => {
      let av, bv;
      if (sortKey === 'bitis_tarihi') { av = dateToSortKey(a.bitis_tarihi); bv = dateToSortKey(b.bitis_tarihi); return sortAsc ? av - bv : bv - av; }
      if (sortKey === 'brut_tl') { av = parseNum(a.brut_tl) || 0; bv = parseNum(b.brut_tl) || 0; return sortAsc ? av - bv : bv - av; }
      if (sortKey === 'brut_2026') { av = parseNum(a.brut_2026) || 0; bv = parseNum(b.brut_2026) || 0; return sortAsc ? av - bv : bv - av; }
      av = String(a[sortKey] || '').toLowerCase(); bv = String(b[sortKey] || '').toLowerCase();
      return sortAsc ? av.localeCompare(bv, 'tr') : bv.localeCompare(av, 'tr');
    });
  }

  // Listenin altındaki toplam üretim — filtre/aramadan SONRAKİ satırlar üzerinden
  // hesaplanır, yani ekranda ne görünüyorsa onun toplamıdır.
  const brutSum = filtered.reduce((a, r) => a + (parseNum(r.brut_tl) || 0), 0);

  // ── Toplu seçim yardımcıları ──
  const colCount = COLS.length + (selectMode ? 1 : 0);
  const visibleIds = filtered.map((r) => r.id);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));
  const toggleSelectAll = () => setSelected((prev) => {
    const next = new Set(prev);
    if (allVisibleSelected) visibleIds.forEach((id) => next.delete(id));
    else visibleIds.forEach((id) => next.add(id));
    return next;
  });
  async function applyBulkStatus(status) {
    const ids = [...selected];
    if (!ids.length || !status) return;
    if (!confirm(`${ids.length} kaydın durumu "${status}" olarak güncellenecek.\n\nOnaylıyor musunuz?`)) return;
    const r = await policies.bulkStatus(ids, status);
    if (r.ok) {
      toast(`${r.data.updated} kaydın durumu güncellendi.`, 'ok');
      setRecords((prev) => prev.map((x) => (selected.has(x.id) ? { ...x, sistem_durum: status } : x)));
      setSelected(new Set());
      loadSummary(); loadStats();
    } else toast(r.error || 'Güncellenemedi.', 'err', 5000);
  }

  return (
    <div className={`panel ${sidebarOpen ? 'sb-open' : 'sb-closed'}`}>
      {/* ── SIDEBAR ── */}
      <aside className="p-sidebar">
        <div className="p-sidebar-header">
          <div className="p-sidebar-logo" title={tenantName || 'Zenith Peak'}><TenantBrand name={tenantName} /></div>
          <button className="p-sidebar-close" onClick={closeSidebar}>✕</button>
        </div>

        <nav className="p-sidebar-nav">
          <div className="p-sidebar-section">Veri</div>
          <button className="p-sidebar-btn" onClick={() => { newRecord(); closeSidebar(); }}>
            <span className="sb-icon">＋</span> Yeni Kayıt Oluştur
          </button>

          <div className="p-sidebar-divider" />
          <div className="p-sidebar-section">Navigasyon</div>
          <button className={`p-sidebar-btn ${view === 'dashboard' ? 'active' : ''}`} onClick={showDashboard}>
            <span className="sb-icon">🏠</span> Ana Sayfa
          </button>
          <button className={`p-sidebar-btn ${view === 'uretim' || view === 'month' ? 'active' : ''}`} onClick={showUretim}>
            <span className="sb-icon">📈</span> Üretim Listesi
          </button>
          <button className="p-sidebar-btn" onClick={() => { openContactSearch(); closeSidebar(); }}>
            <span className="sb-icon">🔎</span> Kontak Arama
          </button>
          <button className={`p-sidebar-btn ${view === 'takip' ? 'active' : ''}`} onClick={showTakip}>
            <span className="sb-icon">🗓️</span> Takip Edilen İşler
          </button>
          <button className={`p-sidebar-btn ${view === 'grafikler' ? 'active' : ''}`} onClick={showGrafikler}>
            <span className="sb-icon">📊</span> Grafikler
          </button>

          <div className="p-sidebar-divider" />
          <div className="p-sidebar-section">Uygulamalar</div>
          <button className={`p-sidebar-btn ${view === 'ruhsat' ? 'active' : ''}`} onClick={showRuhsat}>
            <span className="sb-icon">📋</span> Ruhsat Okuyucu
          </button>
          <button className={`p-sidebar-btn ${view === 'dispolice' ? 'active' : ''}`} onClick={showDisPolice}>
            <span className="sb-icon">📄</span> Dış Poliçe Takip
          </button>
          <button className={`p-sidebar-btn ${view === 'polisoftcompare' ? 'active' : ''}`} onClick={showPolisoftCompare}>
            <span className="sb-icon">📊</span>
            <span className="sb-label">Polisoft – Sigorta Şirketi Karşılaştırması</span>
          </button>
        </nav>

        <div className="p-sidebar-footer">
          <div className="p-sidebar-user">
            <div className="p-user-avatar">{(user || 'K').charAt(0).toLocaleUpperCase('tr-TR')}</div>
            <div>
              <div className="p-user-name">{user || 'kullanıcı'}</div>
              <div className="p-user-role">{tenantName || 'Acente'}</div>
            </div>
          </div>
          {/* Birden fazla acenteye erişimi olan kullanıcı (yönetici ya da
              kendisine ek acente açılmış kişi) buradan çıkış yapmadan geçer.
              Tek acentesi olanda kutu hiç görünmez. */}
          {tenants.length > 1 && (
            <label className="p-tenant-switch">
              <span>Acente</span>
              <select value={tenantId} onChange={(e) => switchTenant(e.target.value)}>
                {tenants.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </label>
          )}
          <button className="p-logout" onClick={logout}>Çıkış Yap</button>
        </div>
      </aside>
      <div className="p-backdrop" onClick={closeSidebar} />

      {/* ── TOPBAR ── */}
      <header className="p-topbar">
        <button className="p-hamburger" onClick={() => setSidebarOpen(true)} aria-label="Menü">
          <span /><span /><span />
        </button>
        <TopbarBack />
        <span className="p-topbar-sep" aria-hidden="true" />
        <div className="p-topbar-title"><TenantBrand name={tenantName} /></div>
        <div className="p-breadcrumb">
          <span className="crumb" onClick={showDashboard}>Ana Sayfa</span>
          {(view === 'uretim' || view === 'month') && <><span className="sep">›</span><span className="crumb" onClick={showUretim}>Üretim Listesi</span></>}
          {view === 'month' && <><span className="sep">›</span><span>{MONTHS_TR[currentMonth]}</span></>}
          {view === 'takip' && <><span className="sep">›</span><span>Takip Edilen İşler</span></>}
          {view === 'grafikler' && <><span className="sep">›</span><span>Grafikler</span></>}
          {view === 'settings' && <><span className="sep">›</span><span>Ayarlar</span></>}
        </div>
        <div className="p-topbar-right">
          <button className="topbar-help" onClick={() => openHelp('genel')} title="Nasıl Kullanılır?" aria-label="Nasıl Kullanılır?">
            <span className="topbar-help-icon">❓</span>
            <span className="topbar-help-label">Nasıl Kullanılır?</span>
          </button>
          <NotificationBell tenant={tenantName} user={user} onOpenTakip={showTakip} />
          <ThemeToggle />
          <button className={`topbar-gear ${view === 'settings' ? 'active' : ''}`} onClick={showSettings} title="Ayarlar" aria-label="Ayarlar">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
          <div className="sync-pill">
            <span className={`sync-dot ${sync.state === 'syncing' ? 'syncing' : sync.state === 'error' ? 'error' : ''}`} />
            <span>{sync.text}</span>
          </div>
        </div>
      </header>

      {/* ── MAIN ── */}
      <main className="p-main">
        {view === 'dashboard' && (
          <>
            <div className="dash-header">
              <div className="dashboard-greeting">
                <h1>Hoş geldiniz, {user || 'kullanıcı'} 👋</h1>
                <p>{tenantName || 'Zenith Peak'} yönetim paneli</p>
              </div>
              <button className="btn btn-navy ks-open-btn" onClick={openContactSearch}>🔎 Kontak Arama</button>
            </div>
            {!stats ? (
              <div className="dash-loading">Yükleniyor…</div>
            ) : (
              <>
                {/* Grafikler geçmişi anlatır, ajanda yarını — geniş ekranda yan
                    yana dururlar; dar ekranda ajanda grafiklerin altına iner. */}
                <div className="dash-grid">
                  <div className="chart-row">
                    <PieChart title="Üretim Dağılımı" subtitle="Yıllık brüt prim tutarına göre sigorta türü dağılımı"
                      slices={toSlices(stats.byType, 7)} format={fmtTL} />
                    <PieChart title="Satışlar Dağılımı" subtitle="Yıllık brüt prim tutarına göre sigorta şirketi dağılımı"
                      slices={toSlices(stats.byCompany, 7)} format={fmtTL} />
                  </div>
                  <UpcomingJobs onOpen={showTakip} />
                </div>
                <div className="metric-row">
                  <MetricTile icon="📋" tone="blue" label="Toplam Üretim" value={fmtTL(stats.total)} />
                  <MetricTile icon="🛡️" tone="green" label="Toplam Poliçe" value={stats.count} />
                  <MetricTile icon="🧾" tone="orange" label="Ortalama Poliçe Tutarı" value={fmtTL(stats.average)} />
                  <MetricTile icon="🏆" tone="violet" label="En Çok Üretim" value={stats.topType || '—'} />
                </div>
              </>
            )}
          </>
        )}

        {view === 'uretim' && (
          <>
            <div className="dash-header">
              <div className="dashboard-greeting">
                <h1>Üretim Listesi</h1>
                <p>Çalışmak istediğiniz ayı seçin</p>
              </div>
              <button className="btn btn-navy ks-open-btn" onClick={openContactSearch}>🔎 Kontak Arama</button>
            </div>
            <div className="month-grid">
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => {
                const s = summary[m] || {};
                const tot = parseInt(s.total) || 0;
                const done = parseInt(s.done) || 0;
                const cancelled = parseInt(s.cancelled) || 0;
                const partial = parseInt(s.partial) || 0;
                const wontDo = parseInt(s.wont_do) || 0;
                const pend = Math.max(0, tot - done - cancelled - partial - wontDo);
                // Geçen yılın primi toplamı — sunucudan hazır gelir (month_summary
                // içindeki SUM), istemcide tekrar hesaplanmaz.
                const brutTot = Number(s.brut_total) || 0;
                const grade = monthGrade(tot, done);
                return (
                  <div key={m} className={`month-card ${m === cm ? 'current-month' : ''}`} onClick={() => showMonth(m)}>
                    {grade && <div className="month-grade">{grade}</div>}
                    <div className="month-num">{String(m).padStart(2, '0')}</div>
                    <div className="month-name">{MONTHS_TR[m]}</div>
                    <div className="month-stats">
                      {tot > 0 ? (
                        <>
                          <div className="month-stat"><span className="month-stat-label">Toplam</span><span className="month-stat-val stat-total">{tot}</span></div>
                          <div className="month-stat"><span className="month-stat-label">Tamamlandı</span><span className="month-stat-val stat-done">{done}</span></div>
                          <div className="month-stat"><span className="month-stat-label">İptal</span><span className="month-stat-val stat-cancel">{cancelled}</span></div>
                          <div className="month-stat"><span className="month-stat-label">Yapılmayacak</span><span className="month-stat-val stat-wontdo">{wontDo}</span></div>
                          <div className="month-stat"><span className="month-stat-label">Bekliyor</span><span className="month-stat-val stat-pend">{pend}</span></div>
                          <div className="month-stat month-stat-sum">
                            <span className="month-stat-label">Geçen Yıl Primi</span>
                            <span className="month-stat-val stat-brut">{formatCurrency(brutTot)} ₺</span>
                          </div>
                        </>
                      ) : <span className="month-stat-val stat-empty">Kayıt yok</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {view === 'month' && (
          <>
            {/* Geri butonu üst bardadır (sabit) — burada tekrarlanmaz. */}
            <div className="month-view-header">
              <div className="month-view-title">{MONTHS_TR[currentMonth]} {new Date().getFullYear()}</div>
              <span className="month-badge">{filtered.length} kayıt</span>
              <button className="btn btn-navy ks-open-btn mvh-ks" onClick={openContactSearch}>🔎 Kontak Arama</button>
            </div>
            <div className="table-controls">
              <div className="search-box">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" /></svg>
                <input placeholder="İsim, plaka, poliçe no ile ara..." value={q} onChange={(e) => setQ(e.target.value)} />
              </div>
              <select className="filter-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                <option value="">Tüm Durumlar</option>
                {STATUS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <select className="filter-select" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
                <option value="">Tüm Poliçe Türleri</option>
                {typeOptions(typeCats).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
              <div className="tc-right">
                <label className="bulk-toggle" title="Toplu seçim modunu aç/kapat">
                  <input type="checkbox" checked={selectMode}
                    onChange={(e) => { setSelectMode(e.target.checked); if (!e.target.checked) setSelected(new Set()); }} />
                  <span>Toplu Seçim</span>
                </label>
                <div className="tc-btns">
                  <label className="tc-btn gold" title="Excel Yükle & Aktar">
                    📥 Excel Yükle &amp; Aktar
                    <input type="file" accept=".xlsx,.xls" hidden onChange={doImport} />
                  </label>
                  <button className="tc-btn" onClick={doExport} title="Excel Olarak Dışarı Aktar">📤 Excel Olarak Dışarı Aktar</button>
                </div>
                <span className="record-count-pill">{filtered.length} kayıt</span>
              </div>
            </div>

            {selectMode && (
              <div className="bulk-bar">
                <span className="bulk-count">{selected.size} kayıt seçildi</span>
                <select className="filter-select" value=""
                  disabled={!selected.size}
                  onChange={(e) => { const v = e.target.value; e.target.value = ''; applyBulkStatus(v); }}>
                  <option value="">Seçilenleri şu duruma al…</option>
                  {STATUS.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
                <button className="tc-btn" onClick={toggleSelectAll}>
                  {allVisibleSelected ? '✖ Seçimi Kaldır' : '☑ Tümünü Seç'}
                </button>
                {selected.size > 0 && (
                  <button className="tc-btn" onClick={() => setSelected(new Set())}>Temizle</button>
                )}
              </div>
            )}

            <div className="tbl-wrap">
              <table className="data">
                <thead>
                  <tr>
                    {selectMode && (
                      <th className="sel-cell">
                        <input type="checkbox" checked={allVisibleSelected} onChange={toggleSelectAll}
                          title={allVisibleSelected ? 'Seçimi kaldır' : 'Tümünü seç'} />
                      </th>
                    )}
                    {COLS.map(([key, label]) => (
                      <th key={key} onClick={() => sortBy(key)}>
                        {label}
                        {sortKey === key && <span className="sort-ind">{sortAsc ? '▲' : '▼'}</span>}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {/* Yeni eklenenler en üstte: acente açar açmaz görsün */}
                  {filtered.some(isNewRec) && (
                    <tr className="new-section-row">
                      <td colSpan={colCount}>🆕 YENİ EKLENEN MÜŞTERİLER ({filtered.filter(isNewRec).length})</td>
                    </tr>
                  )}
                  {filtered.filter(isNewRec).map((r) => renderRow(r, true))}
                  {filtered.filter((r) => !isNewRec(r)).map((r) => renderRow(r))}
                  {!filtered.length && <tr><td colSpan={colCount} style={{ textAlign: 'center', color: 'var(--muted)', padding: 40 }}>Bu ay için kayıt bulunamadı.</td></tr>}
                </tbody>
                {filtered.length > 0 && (
                  <tfoot>
                    <tr className="total-row">
                      {/* Brüt (TL) sütununa kadar olan hücreler tek etikette birleşir */}
                      <td colSpan={BRUT_COL + (selectMode ? 1 : 0)} className="total-label">TOPLAM ÜRETİM</td>
                      <td className="mono total-val">{formatCurrency(brutSum)} ₺</td>
                      <td colSpan={COLS.length - BRUT_COL - 1}></td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </>
        )}

        {view === 'ruhsat' && (
          <Suspense fallback={<div className="set-loading">Ruhsat okuyucu yükleniyor…</div>}>
            <RuhsatReader onTransferred={() => { loadSummary(); loadStats(); setContacts(null); }} />
          </Suspense>
        )}

        {view === 'dispolice' && (
          <Suspense fallback={<div className="set-loading">Dış Poliçe Takip yükleniyor…</div>}>
            <DisPoliceTakip />
          </Suspense>
        )}

        {view === 'polisoftcompare' && (
          <Suspense fallback={<div className="set-loading">Karşılaştırma aracı yükleniyor…</div>}>
            <PolisoftCompare />
          </Suspense>
        )}

        {view === 'takip' && <TakipIsler companies={options.companies} types={options.types} />}

        {view === 'grafikler' && (
          <>
            <div className="dash-header">
              <div className="dashboard-greeting">
                <h1>Grafikler</h1>
                <p>Yenilenme oranı, aylık üretim ve geçen yıla göre değişim</p>
              </div>
            </div>
            <Suspense fallback={<div className="set-loading">Grafikler yükleniyor…</div>}>
              <Analytics />
            </Suspense>
          </>
        )}

        {view === 'settings' && (
          <Settings
            onUserChanged={setUser}
            onDataChanged={() => { loadOptions(); loadStats(); loadSummary(); setContacts(null); }}
            onOpenGuide={openHelp}
          />
        )}
      </main>

      {/* ── EDITOR (centered full-screen modal) ── */}
      {editing && (
        <div className="editor-overlay" onMouseDown={(e) => e.target === e.currentTarget && setEditing(null)}>
          <div className="editor-panel">
            <div className="editor-topbar">
              <button className="editor-close" onClick={() => setEditing(null)} title="Kapat">✕</button>
              <div className="editor-title">{editing.hesap_adi || (editing.id ? `Kayıt #${editing.id}` : 'Yeni Kayıt')}</div>
              <button className={`editor-msgtoggle ${msgOpen ? 'active' : ''}`} onClick={() => setMsgOpen((o) => !o)} title="Otomatik Mesaj">🔔</button>
              <button className="editor-teklif" onClick={() => setTeklif(editing)}
                title="Bu müşteri için teklif belgesi hazırla">📄 TEKLİF PDF</button>
              {editing.id && <button className="editor-del" onClick={remove} title="Sil">🗑</button>}
              <button className="editor-save" onClick={save} disabled={saving}>{saving ? '...' : '💾 KAYDET'}</button>
            </div>

            <div className={`editor-content ${msgOpen ? '' : 'msg-collapsed'}`}>
              <div className="editor-main">
                {editing.id && (
                  <div className="editor-info">🕓 Son düzenleyen: {editing.updated_by || '—'} — {formatDateTime(editing.updated_at)}</div>
                )}
                <div className="editor-grid">
                  {EDIT_FIELDS.map(([key, label]) => (
                    <div className="field" key={key} style={{ marginBottom: 0 }}>
                      <label>
                        {label}
                        {REQUIRED.has(key) && <span className="req"> *</span>}
                        {(key === 'tc_kimlik_no' || key === 'vergi_kimlik_no') && <span className="req-note"> (biri zorunlu)</span>}
                      </label>
                      {(key === 'bitis_tarihi' || key === 'dogum_tarihi')
                        ? <input type="date" value={toDateInput(editing[key])} onChange={(e) => setEditing((s) => ({ ...s, [key]: fromDateInput(e.target.value) }))} />
                        : key === 'hesap_adi'
                        ? <input value={editing[key] ?? ''} onChange={(e) => setEditing((s) => ({ ...s, hesap_adi: e.target.value.toLocaleUpperCase('tr-TR') }))} />
                        : (key === 'sigorta_sirketi' || key === 'police_turu')
                        ? (
                          <select value={editing[key] ?? ''} onChange={(e) => setEditing((s) => ({ ...s, [key]: e.target.value }))}>
                            <option value="">— Seçiniz —</option>
                            {withCurrent(key === 'sigorta_sirketi' ? options.companies : options.types, editing[key]).map((o) => (
                              <option key={o} value={o}>{o}</option>
                            ))}
                          </select>
                        )
                        : idLimit(key)
                        // Kimlik numaraları: yalnızca rakam, sabit hane sınırı.
                        ? <input value={editing[key] ?? ''} inputMode="numeric" autoComplete="off"
                            maxLength={idLimit(key)} placeholder={'0'.repeat(idLimit(key))}
                            onChange={(e) => setEditing((s) => ({ ...s, [key]: digitsOnly(e.target.value, idLimit(key)) }))} />
                        : <input value={editing[key] ?? ''} onChange={(e) => setEditing((s) => ({ ...s, [key]: e.target.value }))} />}
                    </div>
                  ))}
                  <div className="field" style={{ marginBottom: 0 }}>
                    <label>İşlem Durumu</label>
                    <select value={editing.sistem_durum ?? 'Çalışılmadı'} onChange={(e) => setEditing((s) => ({ ...s, sistem_durum: e.target.value }))}>
                      {STATUS.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  {ctype && (
                    <div className="full">
                      <Comparison
                        type={ctype}
                        kaskoRows={kaskoRows}
                        trafikRows={trafikRows}
                        rec={editing}
                        onKasko={onKasko}
                        onTrafik={onTrafik}
                        on722={on722}
                        companies={options.companies}
                        onSendToTeklif={sendToTeklif}
                      />
                    </div>
                  )}
                  {isDask && (
                    <div className="field full" style={{ marginBottom: 0 }}>
                      <label>Adres</label>
                      <input value={editing.adres ?? ''} onChange={(e) => setEditing((s) => ({ ...s, adres: e.target.value }))} />
                    </div>
                  )}
                  <div className="field full" style={{ marginBottom: 0 }}>
                    <label>Notlar / Açıklamalar</label>
                    <textarea rows={8} value={editing.notlar ?? ''} onChange={(e) => setEditing((s) => ({ ...s, notlar: e.target.value }))} />
                  </div>
                </div>
              </div>

              <div className="editor-side">
                <div className="editor-side-card">
                  <div className="editor-side-hd">
                    <span>🔔 Otomatik Mesaj</span>
                    <span style={{ display: 'flex', gap: 4 }}>
                      <button className="editor-regen" onClick={() => setEditing((s) => ({ ...s, otomatik_mesaj: genAutoMsg(s) }))} title="Yeniden oluştur">↻</button>
                      <button className="editor-regen" onClick={() => setMsgOpen(false)} title="Gizle">✕</button>
                    </span>
                  </div>
                  <div className="editor-side-body">
                    <textarea value={editing.otomatik_mesaj ?? ''} onChange={(e) => setEditing((s) => ({ ...s, otomatik_mesaj: e.target.value }))} placeholder="Poliçe türüne göre otomatik oluşturulur…" />
                  </div>
                  <button className="editor-copy" onClick={() => { navigator.clipboard?.writeText(editing.otomatik_mesaj || ''); toast('Mesaj kopyalandı.', 'ok'); }}>📋 KOPYALA</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── TEKLİF BELGESİ (müşteriye özel; düzenleyicinin üstüne biner) ── */}
      {teklif && (
        <TeklifPdf
          rec={teklif}
          tenantName={tenantName}
          user={user}
          companies={options.companies}
          prefill={teklifPrefill}
          onClose={() => setTeklif(null)}
        />
      )}

      {/* ── CONTACT SEARCH ── */}
      {contactsOpen && (
        <ContactSearch
          contacts={contacts || []}
          loading={contacts === null}
          paused={!!editing}
          onClose={() => setContactsOpen(false)}
          onOpenPolicy={openPolicyFromContact}
        />
      )}

      {/* ── NASIL KULLANILIR? ── */}
      {helpOpen && <HelpGuide onClose={() => setHelpOpen(false)} initialSection={helpSection} />}

      {/* ── FLOATING AI ADVISOR ── */}
      <Chatbot />
    </div>
  );
}
