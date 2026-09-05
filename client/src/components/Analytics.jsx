// ============================================================
//  Analytics.jsx — Sidebar → "Grafikler".
//
//  Acente sahibinin portföyünü tek ekrandan izlediği detaylı analiz
//  sayfası: aylık üretim, yenilenme oranı, geçen yıla göre prim artışı,
//  tür / şirket / prodüktör kırılımları.
//
//  Hesap YOK burada — hepsi `lib/analytics.js`te (saf fonksiyonlar).
//  Bu dosya yalnızca çizer ve filtreler. Veri TEK seferde çekilir
//  (`action=analytics`); filtre değişince sunucuya tekrar gidilmez.
//
//  Ölçüt tanımları ekranın altında "Nasıl hesaplanıyor?" bölümünde
//  yazılıdır — rakamın nereden geldiğini göremeyen kullanıcı grafiğe
//  güvenmez. Tanımı değiştirirsen O METNİ DE değiştir.
// ============================================================

import { useEffect, useMemo, useState } from 'react';
import { policies } from '../lib/api.js';
import PieChart from './PieChart.jsx';
import { GroupedBarChart, StackedBarChart, LineChart, HBarChart, DivergingBarChart } from './Charts.jsx';
import { toSlices, fmtTL, PALETTE } from '../lib/stats.js';
import {
  analyze, toMap, fmtPct, fmtDelta, fmtCompact, SERIES, MONTHS_SHORT,
} from '../lib/analytics.js';

const MONTH_CATS = MONTHS_SHORT.slice(1);

const fmtInt = (v) => Math.round(v || 0).toLocaleString('tr-TR');
const moneyFmt = { axis: fmtCompact, value: fmtTL };
const countFmt = { axis: (v) => fmtInt(v), value: fmtInt };
const pctFmt = { axis: (v) => (v * 100).toFixed(0) + '%', value: (v) => fmtPct(v) };

// KPI kutusu — büyük rakam + isteğe bağlı değişim rozeti.
function Kpi({ icon, tone, label, value, sub, delta }) {
  return (
    <div className="an-kpi">
      <div className={`an-kpi-icon tone-${tone}`}>{icon}</div>
      <div className="an-kpi-text">
        <div className="an-kpi-label">{label}</div>
        <div className="an-kpi-value">{value}</div>
        {(sub || delta != null) && (
          <div className="an-kpi-sub">
            {delta != null && (
              <span className={`an-chip ${delta >= 0 ? 'up' : 'down'}`}>{delta >= 0 ? '▲' : '▼'} {fmtDelta(delta)}</span>
            )}
            {sub}
          </div>
        )}
      </div>
    </div>
  );
}

const BREAKDOWNS = [
  ['type', 'Poliçe Türü', 'byType'],
  ['company', 'Sigorta Şirketi', 'byCompany'],
  ['producer', 'Prodüktör', 'byProducer'],
];

export default function Analytics() {
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState('');
  const [filters, setFilters] = useState({ year: '', type: '', company: '', producer: '' });
  const [tab, setTab] = useState('type');
  const [showTable, setShowTable] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const r = await policies.analytics();
      if (!alive) return;
      if (r.ok) setRows(r.data); else setErr(r.error || 'Veriler alınamadı.');
    })();
    return () => { alive = false; };
  }, []);

  const a = useMemo(() => (rows ? analyze(rows, filters) : null), [rows, filters]);

  // Yıl listesi geldiğinde en güncel yılı ön-seç: acente sahibi ekranı
  // açtığında "bu sene ne oldu"yu görmek ister, 8 yıllık toplamı değil.
  useEffect(() => {
    if (a && !filters.year && a.years.length) setFilters((f) => ({ ...f, year: String(a.years[0]) }));
  }, [a?.years.length]);

  if (err) return <div className="an-wrap"><div className="an-error">{err}</div></div>;
  if (!a) return <div className="an-wrap"><div className="set-loading">Analiz verileri yükleniyor…</div></div>;

  const t = a.totals;
  const set = (k) => (e) => setFilters((f) => ({ ...f, [k]: e.target.value }));
  const active = BREAKDOWNS.find(([k]) => k === tab);
  const list = a[active[2]];
  const top = list.slice(0, 8);

  return (
    <div className="an-wrap">
      {/* ── Filtreler ── */}
      <div className="an-filters">
        <select className="filter-select" value={filters.year} onChange={set('year')}>
          <option value="">Tüm yıllar</option>
          {a.years.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        <select className="filter-select" value={filters.type} onChange={set('type')}>
          <option value="">Tüm türler</option>
          {a.options.types.map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
        <select className="filter-select" value={filters.company} onChange={set('company')}>
          <option value="">Tüm şirketler</option>
          {a.options.companies.map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
        <select className="filter-select" value={filters.producer} onChange={set('producer')}>
          <option value="">Tüm prodüktörler</option>
          {a.options.producers.map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
        <button className="btn btn-ghost an-reset"
          onClick={() => setFilters({ year: '', type: '', company: '', producer: '' })}>Filtreleri temizle</button>
        <span className="an-count">{fmtInt(a.filtered)} kayıt</span>
      </div>

      {/* ── KPI ── */}
      <div className="an-kpi-row">
        <Kpi icon="🔁" tone="green" label="Yenilenme Oranı" value={fmtPct(t.rate)}
          sub={`${fmtInt(t.renewed)} / ${fmtInt(t.base)} poliçe`} />
        <Kpi icon="📈" tone="blue" label="Prim Artışı (geçen yıla göre)" value={fmtDelta(t.growth)}
          sub={`${fmtInt(t.mCount)} yenilenen poliçe karşılaştırıldı`} />
        <Kpi icon="💼" tone="orange" label="Bu Yıl Üretim" value={fmtTL(t.cur)}
          sub={`geçen yıl aynı poliçeler: ${fmtTL(t.mPrev)}`} />
        <Kpi icon="🗂️" tone="violet" label="Portföy (geçen yıl primi)" value={fmtTL(t.prev)}
          sub={`${fmtInt(t.total)} poliçe`} />
        <Kpi icon="⚠️" tone="red" label="Kayıp Oranı (iptal)" value={fmtPct(t.base > 0 ? t.lost / t.base : null)}
          sub={`${fmtInt(t.lost)} iptal · ${fmtInt(t.pending)} bekleyen`} />
        <Kpi icon="🏆" tone="gold" label="En İyi Ay" value={a.bestMonth ? a.bestMonth.label : '—'}
          sub={a.bestMonth ? `${fmtPct(a.bestMonth.rate)} yenilenme · en zayıf ${a.worstMonth.label} (${fmtPct(a.worstMonth.rate)})` : 'veri yok'} />
      </div>

      {/* ── Aylık üretim: geçen yıl ↔ bu yıl (aynı birim, tek eksen) ── */}
      <GroupedBarChart
        title="Aylık Üretim — Geçen Yıl / Bu Yıl"
        subtitle="Bitiş ayına göre brüt prim. Geçen yıl = portföydeki tüm poliçeler, bu yıl = yenilenerek yazılanlar."
        categories={MONTH_CATS}
        series={[
          { name: 'Geçen yıl primi', color: SERIES.prev, values: a.months.map((m) => m.prev) },
          { name: 'Bu yıl üretimi', color: SERIES.cur, values: a.months.map((m) => m.cur) },
        ]}
        format={moneyFmt}
        note={a.undated.total > 0 ? `${fmtInt(a.undated.total)} kaydın bitiş tarihi okunamadı; aylık grafiklere girmedi.` : null}
      />

      <div className="an-grid-2">
        {/* Yenilenme oranı — oran ve tutar farklı birim, bilerek AYRI grafik */}
        <LineChart
          title="Aylık Yenilenme Oranı"
          subtitle="Yenilenen / (toplam − yapılmayacak). Kayıt olmayan ayda çizgi kopar."
          categories={MONTH_CATS}
          series={[{ name: 'Yenilenme oranı', color: SERIES.renewed, values: a.months.map((m) => m.rate) }]}
          format={pctFmt}
          yTop={1}
          refLine={t.rate ?? null}
        />
        <StackedBarChart
          title="Aylık Portföy Durumu"
          subtitle="Poliçe adedi olarak sonuç dağılımı."
          categories={MONTH_CATS}
          series={[
            { name: 'Yenilenen', color: SERIES.renewed, values: a.months.map((m) => m.renewed) },
            { name: 'İptal', color: SERIES.lost, values: a.months.map((m) => m.lost) },
            { name: 'Bekleyen', color: SERIES.pending, values: a.months.map((m) => m.pending) },
            { name: 'Yapılmayacak', color: SERIES.wontDo, values: a.months.map((m) => m.wontDo) },
          ]}
          format={countFmt}
        />
      </div>

      <div className="an-grid-2">
        <DivergingBarChart
          title="Aylık Prim Artışı"
          subtitle="Yenilenen poliçelerde güncel primin geçen yıla göre değişimi (benzer-benzere)."
          rows={a.months.map((m) => ({ label: m.label, value: m.growth }))}
          format={fmtDelta}
          posColor={SERIES.renewed}
          negColor={SERIES.lost}
        />
        {/* Tek ölçü çiziliyor → her çubuk AYNI renk. Sıraya göre renklendirmek
            (1. mavi, 2. yeşil…) rengi kimlik sanma yanılgısı yaratır ve filtre
            değişince hayatta kalanları yeniden boyar. */}
        <HBarChart
          title={`Yenilenme Oranı — ${active[1]}`}
          subtitle="En çok portföyü olan 8 kırılım; oran düşükse kayıp oradadır."
          rows={top.map((b) => ({ label: b.label, value: b.rate ?? 0 }))}
          color={PALETTE[0]}
          format={(v) => fmtPct(v)}
          max={1}
        />
      </div>

      <div className="chart-row">
        <PieChart title="Üretim Dağılımı — Poliçe Türü"
          subtitle="Bu yıl yazılan brüt prime göre tür dağılımı"
          slices={toSlices(toMap(a.byType, 'cur'), 7)} format={fmtTL} />
        <PieChart title="Üretim Dağılımı — Sigorta Şirketi"
          subtitle="Bu yıl yazılan brüt prime göre şirket dağılımı"
          slices={toSlices(toMap(a.byCompany, 'cur'), 7)} format={fmtTL} />
      </div>

      {/* ── Kırılım tablosu (grafiklerin tablo görünümü + detay) ── */}
      <div className="an-panel">
        <div className="an-panel-head">
          <div className="an-tabs">
            {BREAKDOWNS.map(([k, label]) => (
              <button key={k} className={`an-tab ${tab === k ? 'active' : ''}`} onClick={() => setTab(k)}>{label}</button>
            ))}
          </div>
          <span className="an-panel-hint">Portföy primine göre sıralı</span>
        </div>
        <div className="an-table-scroll">
          <table className="an-table">
            <thead>
              <tr>
                <th>{active[1]}</th>
                <th className="r">Toplam</th>
                <th className="r">Yenilenen</th>
                <th className="r">İptal</th>
                <th className="r">Bekleyen</th>
                <th className="r">Yenilenme</th>
                <th className="r">Geçen Yıl Primi</th>
                <th className="r">Bu Yıl Üretim</th>
                <th className="r">Prim Artışı</th>
              </tr>
            </thead>
            <tbody>
              {list.length === 0 && <tr><td colSpan={9} className="an-empty-row">Kayıt yok</td></tr>}
              {list.map((b) => (
                <tr key={b.label}>
                  <td className="an-name">{b.label}</td>
                  <td className="r mono">{fmtInt(b.total)}</td>
                  <td className="r mono">{fmtInt(b.renewed)}</td>
                  <td className="r mono">{fmtInt(b.lost)}</td>
                  <td className="r mono">{fmtInt(b.pending)}</td>
                  <td className="r"><RateCell rate={b.rate} /></td>
                  <td className="r mono">{fmtTL(b.prev)}</td>
                  <td className="r mono">{fmtTL(b.cur)}</td>
                  <td className={`r mono an-delta ${b.growth == null ? '' : b.growth >= 0 ? 'pos' : 'neg'}`}>{fmtDelta(b.growth)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td>Toplam</td>
                <td className="r mono">{fmtInt(t.total)}</td>
                <td className="r mono">{fmtInt(t.renewed)}</td>
                <td className="r mono">{fmtInt(t.lost)}</td>
                <td className="r mono">{fmtInt(t.pending)}</td>
                <td className="r mono">{fmtPct(t.rate)}</td>
                <td className="r mono">{fmtTL(t.prev)}</td>
                <td className="r mono">{fmtTL(t.cur)}</td>
                <td className={`r mono an-delta ${t.growth == null ? '' : t.growth >= 0 ? 'pos' : 'neg'}`}>{fmtDelta(t.growth)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* ── Aylık tablo: yukarıdaki üç aylık grafiğin sayısal karşılığı ── */}
      <div className="an-panel">
        <div className="an-panel-head">
          <h3>Aylık Döküm</h3>
          <button className="btn btn-ghost an-toggle" onClick={() => setShowTable((s) => !s)}>
            {showTable ? 'Gizle' : 'Göster'}
          </button>
        </div>
        {showTable && (
          <div className="an-table-scroll">
            <table className="an-table">
              <thead>
                <tr>
                  <th>Ay</th><th className="r">Toplam</th><th className="r">Yenilenen</th>
                  <th className="r">İptal</th><th className="r">Bekleyen</th><th className="r">Yapılmayacak</th>
                  <th className="r">Yenilenme</th><th className="r">Geçen Yıl Primi</th>
                  <th className="r">Bu Yıl Üretim</th><th className="r">Prim Artışı</th>
                </tr>
              </thead>
              <tbody>
                {a.months.map((m) => (
                  <tr key={m.label} className={m.total === 0 ? 'an-row-muted' : ''}>
                    <td className="an-name">{m.label}</td>
                    <td className="r mono">{fmtInt(m.total)}</td>
                    <td className="r mono">{fmtInt(m.renewed)}</td>
                    <td className="r mono">{fmtInt(m.lost)}</td>
                    <td className="r mono">{fmtInt(m.pending)}</td>
                    <td className="r mono">{fmtInt(m.wontDo)}</td>
                    <td className="r"><RateCell rate={m.rate} /></td>
                    <td className="r mono">{fmtTL(m.prev)}</td>
                    <td className="r mono">{fmtTL(m.cur)}</td>
                    <td className={`r mono an-delta ${m.growth == null ? '' : m.growth >= 0 ? 'pos' : 'neg'}`}>{fmtDelta(m.growth)}</td>
                  </tr>
                ))}
                {a.undated.total > 0 && (
                  <tr className="an-row-muted">
                    <td className="an-name">Tarihsiz</td>
                    <td className="r mono">{fmtInt(a.undated.total)}</td>
                    <td className="r mono">{fmtInt(a.undated.renewed)}</td>
                    <td className="r mono">{fmtInt(a.undated.lost)}</td>
                    <td className="r mono">{fmtInt(a.undated.pending)}</td>
                    <td className="r mono">{fmtInt(a.undated.wontDo)}</td>
                    <td className="r"><RateCell rate={a.undated.rate} /></td>
                    <td className="r mono">{fmtTL(a.undated.prev)}</td>
                    <td className="r mono">{fmtTL(a.undated.cur)}</td>
                    <td className="r mono">{fmtDelta(a.undated.growth)}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Tanımlar ── */}
      <details className="an-defs">
        <summary>Nasıl hesaplanıyor?</summary>
        <ul>
          <li><b>Yenilenme oranı</b> = Yenilenen ÷ (Toplam − Yapılmayacak). <i>Yapılmayacak</i> işaretli
            poliçeler paydaya girmez; acentenin bilerek peşine düşmediği iş oranı düşürmemelidir.</li>
          <li><b>Yenilenen</b> = durumu <i>Poliçelendirildi</i> veya <i>Eksik Tahsilat</i> olan poliçeler.
            Eksik tahsilat da poliçeleşmiştir, yalnızca tahsilatı tamamlanmamıştır.</li>
          <li><b>Prim artışı</b> yalnızca yenilenen ve hem geçen yıl hem güncel primi dolu olan
            poliçeler üzerinden hesaplanır (benzer-benzere). Yenilenmemiş poliçenin güncel primi
            olmadığı için ortalamayı yapay olarak düşürmesi engellenir.</li>
          <li><b>Geçen yıl primi</b> = <code>Brüt (TL)</code>, <b>bu yıl üretim</b> = <code>Güncel Prim</code> alanı.</li>
          <li>Aylar poliçenin <b>bitiş tarihine</b> göre gruplanır; elle eklenen ve tarihi boş kayıtlar
            kayıt tarihine düşer. Hiçbir şekilde ay çıkarılamayan kayıtlar “Tarihsiz” satırındadır.</li>
          <li>Poliçe türleri <b>Ayarlar → Poliçe Türleri → Kategoriler</b> eşlemesine göre gruplanır;
            ham tür değeri değiştirilmez.</li>
        </ul>
      </details>
    </div>
  );
}

// Oran hücresi: sayı + minik dolum çubuğu (renk tek başına anlam taşımaz).
function RateCell({ rate }) {
  if (rate == null) return <span className="an-na">—</span>;
  const tone = rate >= 0.7 ? 'good' : rate >= 0.45 ? 'mid' : 'low';
  return (
    <span className="an-rate">
      <span className="an-rate-num mono">{fmtPct(rate, 0)}</span>
      <span className="an-rate-bar"><i className={tone} style={{ width: `${Math.round(rate * 100)}%` }} /></span>
    </span>
  );
}
