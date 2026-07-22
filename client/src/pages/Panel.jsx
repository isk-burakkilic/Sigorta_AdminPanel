import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { policies, auth, resetCsrf } from '../lib/api.js';
import { toast } from '../lib/toast.jsx';
import Chatbot from '../components/Chatbot.jsx';
import Comparison from '../components/Comparison.jsx';
import PieChart from '../components/PieChart.jsx';
import ContactSearch from '../components/ContactSearch.jsx';
import Settings from '../components/Settings.jsx';
import { aggregate, toSlices, fmtTL } from '../lib/stats.js';
import { buildContacts, contactKey } from '../lib/contacts.js';
import {
  compType, parseComparison, genKaskoNotes, regenTrafik, gen722Notes,
  buildSaveNotlar, defaultKaskoRow, defaultTrafikRow,
} from '../lib/comparison.js';
import '../styles/panel.css';

const MONTHS_TR = ['', 'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
const STATUS = ['Çalışılmadı', 'Çalışıldı', 'Poliçelendirildi', 'İptal', 'Eksik Tahsilat', 'Yapılmayacak', 'Dış Teklif Bekleniyor'];

// Month-view table columns (sort key, header label)
const COLS = [
  ['bitis_tarihi', 'Bitiş Tarihi'], ['police_numarasi', 'Poliçe No'], ['hesap_adi', 'Hesap Adı'],
  ['arac_plakasi', 'Plaka'], ['produktor_tali_adi', 'Prodüktör'], ['sigorta_sirketi', 'Sigorta Şirketi'],
  ['police_turu', 'Poliçe Türü'], ['brut_tl', 'Brüt (TL)'], ['tc_kimlik_no', 'TC / Vergi No'],
  ['gsm_no', 'GSM'], ['belge_seri_no', 'Seri No'], ['sistem_durum', 'Durum'],
];

// Editor field grid — order matches the original form panel (4 columns).
const EDIT_FIELDS = [
  ['hesap_adi', 'Hesap Adı'], ['arac_plakasi', 'Araç Plakası'], ['sigorta_sirketi', 'Sigorta Şirketi'], ['police_turu', 'Poliçe Türü'],
  ['brut_tl', 'Brüt (TL)'], ['tc_kimlik_no', 'TC Kimlik No'], ['vergi_kimlik_no', 'Vergi Kimlik No'], ['gsm_no', 'GSM No'],
  ['dogum_tarihi', 'Doğum Tarihi'],
  ['belge_seri_no', 'Belge Seri No'], ['bitis_tarihi', 'Bitiş Tarihi'], ['police_numarasi', 'Poliçe Numarası'], ['produktor_tali_adi', 'Prodüktör / Tali'],
  ['brut_2026', 'Brüt 2026 (TL)'],
];

// Auto-message generator — ported from the legacy generateAutoMessage().
function genAutoMsg(rec) {
  const pType = String(rec.police_turu || '').toUpperCase();
  if (['701', '410', 'TRAFİK', 'TRAFIK', 'KASKO'].some((s) => pType.includes(s))) {
    const tur = (pType.includes('701') || pType.includes('KASKO')) ? 'Kasko' : 'Trafik';
    return `Merhaba, \n${tur} Poliçesi;\n\nTC: ${rec.tc_kimlik_no || ''}\nPlaka: ${rec.arac_plakasi || ''}\nBelge Seri No: ${rec.belge_seri_no || ''}\n\nİyi çalışmalar.`;
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

const statusClass = (s) => {
  const map = {
    'Çalışılmadı': 'calisilmadi', 'Çalışıldı': 'calisildi', 'Poliçelendirildi': 'policelendirildi',
    'İptal': 'iptal', 'Eksik Tahsilat': 'eksik', 'Yapılmayacak': 'yapilmayacak', 'Dış Teklif Bekleniyor': 'dis-teklif',
  };
  return 'status-badge status-' + (map[s] || 'calisilmadi');
};

// Policy-type filter options + matching logic — verbatim from the legacy panel.
const TYPE_OPTIONS = [
  ['410', '410 / Trafik'], ['701', '701 / Kasko'], ['722', '722'], ['956', '956'],
  ['718', '718'], ['800', '800'], ['TIBBI', 'TIBBİ KÖTÜ UYGULAMA'], ['KOBI', 'Kobi (İşyeri + KOBİ)'],
];
function matchType(policeTuru, type) {
  if (!type) return true;
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
  const [sidebarOpen, setSidebarOpen] = useState(true); // open by default on the homepage
  const [view, setView] = useState('dashboard');          // dashboard | uretim | month
  const [summary, setSummary] = useState({});              // keyed by month_num
  const [currentMonth, setCurrentMonth] = useState(null);
  const [records, setRecords] = useState([]);
  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [sortKey, setSortKey] = useState('');
  const [sortAsc, setSortAsc] = useState(true);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [kaskoRows, setKaskoRows] = useState([]);
  const [trafikRows, setTrafikRows] = useState([]);
  const [msgOpen, setMsgOpen] = useState(false); // Otomatik Mesaj panel collapsed by default
  const [sync, setSync] = useState({ state: 'syncing', text: 'Bağlanıyor...' });
  const [stats, setStats] = useState(null);
  const [contactsOpen, setContactsOpen] = useState(false);
  const [contacts, setContacts] = useState(null); // null = not loaded yet
  const [options, setOptions] = useState({ companies: [], types: [] }); // dropdown values from Excel data

  useEffect(() => { auth.session().then((s) => { setUser(s.user || ''); setTenantName(s.tenantName || ''); }); }, []);

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
  useEffect(() => {
    if (ctype === 'kasko' && kaskoRows.length === 0) setKaskoRows([defaultKaskoRow()]);
    if (ctype === 'trafik' && trafikRows.length === 0) setTrafikRows([defaultTrafikRow()]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctype]);

  async function showMonth(m) {
    setCurrentMonth(m); setView('month'); setSidebarOpen(false); setQ(''); setStatusFilter(''); setTypeFilter(''); setSortKey('');
    setSync({ state: 'syncing', text: `${MONTHS_TR[m]} yükleniyor...` });
    const r = await policies.byMonth(m);
    if (r.ok) { setRecords(r.data); setSync({ state: 'ok', text: `${MONTHS_TR[m]} — ${r.data.length} kayıt` }); }
    else setSync({ state: 'error', text: 'Yükleme hatası' });
  }

  function showDashboard() { setView('dashboard'); setSidebarOpen(true); }   // homepage → sidebar open
  function showUretim() { setView('uretim'); loadSummary(); setSidebarOpen(false); } // other pages → closed
  function showSettings() { setView('settings'); setSidebarOpen(false); }

  async function openRecord(id) {
    setMsgOpen(false);
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
  function newRecord() { setKaskoRows([]); setTrafikRows([]); setMsgOpen(false); setEditing({ id: null, sistem_durum: 'Çalışılmadı' }); }

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
  function openPolicyFromContact(id) { setContactsOpen(false); openRecord(id); }

  // Comparison change handlers — mirror the legacy live-notes regeneration.
  const onKasko = (rows) => { setKaskoRows(rows); setEditing((s) => ({ ...s, notlar: genKaskoNotes(rows) })); };
  const onTrafik = (rows) => { setTrafikRows(rows); setEditing((s) => ({ ...s, notlar: regenTrafik(rows, s.notlar) })); };
  const on722 = (key, val) => setEditing((s) => { const next = { ...s, [key]: val }; return { ...next, notlar: gen722Notes(next) }; });

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
      if (r.ok) { toast('Kayıt kaydedildi.', 'ok'); setEditing(null); if (currentMonth) showMonth(currentMonth); loadSummary(); loadStats(); setContacts(null); }
      else toast(r.error || 'Kaydedilemedi.', 'err', 6000);
    } catch { toast('Bağlantı hatası.', 'err'); } finally { setSaving(false); }
  }
  async function remove() {
    if (!editing?.id || !confirm('Bu kaydı silmek istediğinize emin misiniz?')) return;
    const r = await policies.remove(editing.id);
    if (r.ok) { toast('Kayıt silindi.', 'ok'); setEditing(null); if (currentMonth) showMonth(currentMonth); loadSummary(); loadStats(); setContacts(null); }
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

  async function logout() { await auth.logout(); resetCsrf(); nav('/giris', { replace: true }); }

  const closeSidebar = () => setSidebarOpen(false);
  const cm = new Date().getMonth() + 1;

  const isNewRec = (r) => r.is_manually_added == 1 || r.is_manually_added === '1';
  const renderRow = (r, isNew = false) => (
    <tr key={r.id} data-status={r.sistem_durum} className={isNew ? 'new-rec' : ''} onClick={() => openRecord(r.id)}>
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
      av = String(a[sortKey] || '').toLowerCase(); bv = String(b[sortKey] || '').toLowerCase();
      return sortAsc ? av.localeCompare(bv, 'tr') : bv.localeCompare(av, 'tr');
    });
  }

  return (
    <div className={`panel ${sidebarOpen ? 'sb-open' : 'sb-closed'}`}>
      {/* ── SIDEBAR ── */}
      <aside className="p-sidebar">
        <div className="p-sidebar-header">
          <div className="p-sidebar-logo">Zenith <span>Peak</span></div>
          <button className="p-sidebar-close" onClick={closeSidebar}>✕</button>
        </div>

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
        <button className="p-sidebar-btn" onClick={() => nav('/')}>
          <span className="sb-icon">↩</span> Siteye Dön
        </button>

        <div className="p-sidebar-footer">
          <div className="p-sidebar-user">
            <div className="p-user-avatar">{(user || 'K').charAt(0).toLocaleUpperCase('tr-TR')}</div>
            <div>
              <div className="p-user-name">{user || 'kullanıcı'}</div>
              <div className="p-user-role">{tenantName || 'Acente'}</div>
            </div>
          </div>
          <button className="p-logout" onClick={logout}>Çıkış Yap</button>
        </div>
      </aside>
      <div className="p-backdrop" onClick={closeSidebar} />

      {/* ── TOPBAR ── */}
      <header className="p-topbar">
        <button className="p-hamburger" onClick={() => setSidebarOpen(true)} aria-label="Menü">
          <span /><span /><span />
        </button>
        <div className="p-topbar-title">Zenith <span>Peak</span></div>
        <div className="p-breadcrumb">
          <span className="crumb" onClick={showDashboard}>Ana Sayfa</span>
          {(view === 'uretim' || view === 'month') && <><span className="sep">›</span><span className="crumb" onClick={showUretim}>Üretim Listesi</span></>}
          {view === 'month' && <><span className="sep">›</span><span>{MONTHS_TR[currentMonth]}</span></>}
          {view === 'settings' && <><span className="sep">›</span><span>Ayarlar</span></>}
        </div>
        <div className="p-topbar-right">
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
                <p>Zenith Peak yönetim paneli</p>
              </div>
              <button className="btn btn-navy ks-open-btn" onClick={openContactSearch}>🔎 Kontak Arama</button>
            </div>
            {!stats ? (
              <div className="dash-loading">Yükleniyor…</div>
            ) : (
              <>
                <div className="chart-row">
                  <PieChart title="Üretim Dağılımı" subtitle="Yıllık brüt prim tutarına göre sigorta türü dağılımı"
                    slices={toSlices(stats.byType, 7)} format={fmtTL} />
                  <PieChart title="Satışlar Dağılımı" subtitle="Yıllık brüt prim tutarına göre sigorta şirketi dağılımı"
                    slices={toSlices(stats.byCompany, 7)} format={fmtTL} />
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
            <div className="dashboard-greeting">
              <h1>Üretim Listesi</h1>
              <p>Çalışmak istediğiniz ayı seçin</p>
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
            <div className="month-view-header">
              <button className="btn-back" onClick={showUretim}>← Geri</button>
              <div className="month-view-title">{MONTHS_TR[currentMonth]} {new Date().getFullYear()}</div>
              <span className="month-badge">{filtered.length} kayıt</span>
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
                {TYPE_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
              <div className="tc-right">
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
            <div className="tbl-wrap">
              <table className="data">
                <thead>
                  <tr>
                    {COLS.map(([key, label]) => (
                      <th key={key} onClick={() => sortBy(key)}>
                        {label}
                        {sortKey === key && <span className="sort-ind">{sortAsc ? '▲' : '▼'}</span>}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.filter((r) => !isNewRec(r)).map((r) => renderRow(r))}
                  {filtered.some(isNewRec) && (
                    <tr className="new-section-row">
                      <td colSpan={12}>🆕 YENİ EKLENEN MÜŞTERİLER ({filtered.filter(isNewRec).length})</td>
                    </tr>
                  )}
                  {filtered.filter(isNewRec).map((r) => renderRow(r, true))}
                  {!filtered.length && <tr><td colSpan={12} style={{ textAlign: 'center', color: 'var(--muted)', padding: 40 }}>Bu ay için kayıt bulunamadı.</td></tr>}
                </tbody>
              </table>
            </div>
          </>
        )}

        {view === 'settings' && (
          <Settings
            onUserChanged={setUser}
            onDataChanged={() => { loadOptions(); loadStats(); loadSummary(); setContacts(null); }}
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
                      />
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

      {/* ── CONTACT SEARCH ── */}
      {contactsOpen && (
        <ContactSearch
          contacts={contacts || []}
          loading={contacts === null}
          onClose={() => setContactsOpen(false)}
          onOpenPolicy={openPolicyFromContact}
        />
      )}

      {/* ── FLOATING AI ADVISOR ── */}
      <Chatbot />
    </div>
  );
}
