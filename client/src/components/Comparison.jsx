import {
  KASKO_FIRMS, KASKO_TYPES, KASKO_IMM, KASKO_IKAME, TRAFIK_FIRMS,
  defaultKaskoRow, defaultTrafikRow,
} from '../lib/comparison.js';

// Keep the row's current firma selectable even if it's not in the fetched list.
const withCurrent = (list, cur) => (cur && !list.includes(cur) ? [...list, cur] : list);

const Sel = ({ options, value, onChange, style }) => (
  <select value={value ?? ''} onChange={(e) => onChange(e.target.value)} style={style}>
    {options.map((o) => (Array.isArray(o)
      ? <option key={o[1]} value={o[1]}>{o[0]}</option>
      : <option key={o} value={o}>{o}</option>))}
  </select>
);

// ── Kasko (701) ──────────────────────────────────────────────
function KaskoTable({ rows, onChange, companies }) {
  const patch = (i, p) => onChange(rows.map((r, idx) => (idx === i ? { ...r, ...p } : r)));
  const del = (i) => onChange(rows.filter((_, idx) => idx !== i));
  const firms = companies.length ? companies : KASKO_FIRMS;
  const add = () => onChange([...rows, { ...defaultKaskoRow(), firma: firms[0] }]);
  const TK = Array.from({ length: 12 }, (_, i) => `${i + 1}TK`);
  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="kasko-tbl">
        <thead><tr>
          <th>Geçen/<br />Bu Yıl</th><th>Firma</th><th>Poliçe<br />Türü</th><th>İMM</th>
          <th>Orijinal<br />Cam</th><th>Hasarsızlık<br />Koruması</th><th>İkame<br />Araç</th>
          <th>Taksit 1</th><th>Taksit 2</th><th></th>
        </tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td><Sel options={['Geçen Yıl', 'Bu Yıl']} value={r.yil} onChange={(v) => patch(i, { yil: v })} /></td>
              <td><Sel options={withCurrent(firms, r.firma)} value={r.firma} onChange={(v) => patch(i, { firma: v })} /></td>
              <td><Sel options={KASKO_TYPES} value={r.tur} onChange={(v) => patch(i, { tur: v })} /></td>
              <td><Sel options={KASKO_IMM} value={r.imm} onChange={(v) => patch(i, { imm: v })} /></td>
              <td><Sel options={['Var', 'Yok']} value={r.cam} onChange={(v) => patch(i, { cam: v })} /></td>
              <td><Sel options={['Var', 'Yok']} value={r.hasarsizlik} onChange={(v) => patch(i, { hasarsizlik: v })} /></td>
              <td><Sel options={KASKO_IKAME} value={r.ikame} onChange={(v) => patch(i, { ikame: v })} /></td>
              <td>
                <div className="taksit-cell">
                  <Sel options={TK} value={r.taksit1_tk} onChange={(v) => patch(i, { taksit1_tk: v })} />
                  <input value={r.taksit1_fiyat || ''} placeholder="Fiyat" onChange={(e) => patch(i, { taksit1_fiyat: e.target.value })} />
                </div>
              </td>
              <td>
                <div className="taksit-cell">
                  <Sel options={TK} value={r.taksit2_tk} onChange={(v) => patch(i, { taksit2_tk: v })} />
                  <input value={r.taksit2_fiyat || ''} placeholder="Fiyat" onChange={(e) => patch(i, { taksit2_fiyat: e.target.value })} />
                </div>
              </td>
              <td className="del-cell"><button type="button" className="cmp-del-btn" onClick={() => del(i)}>✕</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <button type="button" className="cmp-add-btn" onClick={add}>＋ Satır Ekle</button>
    </div>
  );
}

// ── Trafik (410) ─────────────────────────────────────────────
function TrafikTable({ rows, onChange, companies }) {
  const patch = (i, p) => onChange(rows.map((r, idx) => (idx === i ? { ...r, ...p } : r)));
  const del = (i) => onChange(rows.filter((_, idx) => idx !== i));
  const firms = companies.length ? companies : TRAFIK_FIRMS;
  const add = () => onChange([...rows, { ...defaultTrafikRow(), firma: firms[0] }]);
  const taksitOpts = Array.from({ length: 12 }, (_, i) => [`${i + 1} Taksit`, String(i + 1)]);
  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="trafik-tbl">
        <thead><tr>
          <th>Firma</th><th>Taban<br />Fiyat (TL)</th><th>Taksit<br />Sayısı</th>
          <th>Ekstra Mini<br />Fiyat (TL)</th><th>Ekstra Mini<br />Durumu</th><th></th>
        </tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td><Sel options={withCurrent(firms, r.firma)} value={r.firma} onChange={(v) => patch(i, { firma: v })} /></td>
              <td><input value={r.taban || ''} placeholder="0,00" onChange={(e) => patch(i, { taban: e.target.value })} /></td>
              <td><Sel options={taksitOpts} value={String(r.taksit)} onChange={(v) => patch(i, { taksit: v })} /></td>
              <td><input value={r.mini || ''} placeholder="0,00" onChange={(e) => patch(i, { mini: e.target.value })} /></td>
              <td><Sel options={[['✅ Kesiliyor', 'kesildi'], ['❌ Kesilmiyor', 'kesilmedi']]} value={r.miniDurum} onChange={(v) => patch(i, { miniDurum: v })} /></td>
              <td className="del-cell"><button type="button" className="cmp-del-btn" onClick={() => del(i)}>✕</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <button type="button" className="cmp-add-btn" onClick={add}>＋ Satır Ekle</button>
    </div>
  );
}

// ── 722 / Konut ──────────────────────────────────────────────
function Table722({ rec, onField }) {
  const R = [
    { l: 'Deprem', k: 'deprem', opts: ['-', 'Var', 'Yok'] },
    { l: 'Ekstra Makina', k: 'makina', opts: ['-', 'Var', 'Yok'] },
    { l: 'Bina Teminatı', k: 'bina', opts: null },
    { l: 'Eşya Teminatı', k: 'esya', opts: null },
  ];
  const cell = (k, opts) => opts
    ? <Sel options={opts} value={rec[k] || ''} onChange={(v) => onField(k, v)} />
    : <input value={rec[k] || ''} onChange={(e) => onField(k, e.target.value)} />;
  return (
    <table className="comp-table">
      <thead><tr><th style={{ width: 160 }}>Teminat</th><th>Geçen Yıl</th><th>Bu Yıl</th></tr></thead>
      <tbody>
        {R.map((r) => (
          <tr key={r.k}>
            <td className="rl">📍 {r.l}</td>
            <td>{cell(`${r.k}_gecen`, r.opts)}</td>
            <td>{cell(`${r.k}_buyil`, r.opts)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function Comparison({ type, kaskoRows, trafikRows, rec, onKasko, onTrafik, on722, companies = [] }) {
  if (type === 'kasko') return (
    <div className="cmp-block">
      <div className="cmp-sep">🚗 Kasko Kıyaslama</div>
      <KaskoTable rows={kaskoRows} onChange={onKasko} companies={companies} />
    </div>
  );
  if (type === 'trafik') return (
    <div className="cmp-block">
      <div className="cmp-sep">🚦 Trafik Fiyat Karşılaştırması</div>
      <TrafikTable rows={trafikRows} onChange={onTrafik} companies={companies} />
    </div>
  );
  if (type === '722') return (
    <div className="cmp-block">
      <div className="cmp-sep">🏠 722 Poliçe Kıyaslama</div>
      <Table722 rec={rec} onField={on722} />
    </div>
  );
  return null;
}
