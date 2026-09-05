// ============================================================
//  Charts.jsx — Grafikler ekranının çizim ilkelleri (bağımlılıksız SVG).
//
//  Neden kütüphane yok: recharts/chart.js ana pakete ~150-400 kB ekler ve
//  bu ekranda gereken üç form (gruplu sütun, yığılmış sütun, çizgi) 200
//  satır SVG ile karşılanıyor. Renkler `lib/stats.js`teki doğrulanmış
//  paletten SABİT SIRAYLA gelir — döndürülmez, rastgele atanmaz.
//
//  Kurallar (bozma):
//   • TEK eksen. Farklı birimdeki iki ölçü (₺ ve %) asla aynı grafikte
//     iki y-ekseniyle gösterilmez — ayrı grafik açılır.
//   • ≥2 seride efsane (legend) her zaman vardır; kimlik yalnız renge
//     bırakılmaz.
//   • Izgara ve eksenler geri planda (`--border` / `--muted`), veri önde.
//   • Renkler tema değişkeni değil sabit hex'tir (palet iki temada da
//     doğrulandı); metin ise daima `--muted`/`--text` — seri rengini giymez.
// ============================================================

import { useState, useRef, useLayoutEffect } from 'react';

const H = 280;
const PAD = { t: 16, r: 14, b: 34, l: 62 };
const PH = H - PAD.t - PAD.b;

// SVG genişliği KAPSAYICIDAN ÖLÇÜLÜR, viewBox sabit değildir.
// Sabit viewBox + `height:auto` verilseydi grafik en-boy oranını korumak
// için geniş ekranda 500 px'e uzardı (ve yazılar dev görünürdü). Böylece
// 1 SVG birimi = 1 piksel olur: yükseklik her yerde sabit, yazı boyu sabit.
function useWidth(min = 320) {
  const ref = useRef(null);
  const [w, setW] = useState(720);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(min, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, [min]);
  return [ref, w];
}

// "Güzel" eksen adımı: 1/2/2.5/5 × 10ⁿ.
function niceStep(raw) {
  if (!(raw > 0)) return 1;
  const exp = Math.pow(10, Math.floor(Math.log10(raw)));
  const f = raw / exp;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * exp;
}

function scale(max, ticks = 4) {
  if (!(max > 0)) return { top: 1, step: 1, lines: [0, 1] };
  const step = niceStep(max / ticks);
  const top = Math.ceil(max / step) * step;
  const lines = [];
  for (let v = 0; v <= top + 1e-9; v += step) lines.push(v);
  return { top, step, lines };
}

// Üstü yuvarlatılmış, tabana oturan sütun (veri ucu yuvarlak, taban düz).
function barPath(x, y, w, h, r = 4) {
  if (h <= 0) return '';
  const rr = Math.min(r, w / 2, h);
  return `M ${x} ${y + h} L ${x} ${y + rr} Q ${x} ${y} ${x + rr} ${y}`
       + ` L ${x + w - rr} ${y} Q ${x + w} ${y} ${x + w} ${y + rr} L ${x + w} ${y + h} Z`;
}

function Frame({ title, subtitle, legend, children, empty, note }) {
  return (
    <div className="ch-card">
      <div className="ch-head">
        <h3>{title}</h3>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {empty ? <div className="ch-empty">Veri bulunamadı</div> : (
        <>
          {legend && legend.length > 1 && (
            <div className="ch-legend">
              {legend.map((s) => (
                <span key={s.name} className="ch-legend-item">
                  <i style={{ background: s.color }} />{s.name}
                </span>
              ))}
            </div>
          )}
          {children}
          {note && <div className="ch-note">{note}</div>}
        </>
      )}
    </div>
  );
}

function Tip({ hover, w, children }) {
  if (!hover) return null;
  const flip = hover.x > w * 0.62;
  return (
    <div className="ch-tip" style={{ left: hover.x + (flip ? -10 : 10), top: hover.py, transform: flip ? 'translate(-100%, 0)' : 'none' }}>
      {children}
    </div>
  );
}

// Ortak eksen çizimi.
function Axes({ sc, categories, fmt, bandW, pw }) {
  return (
    <>
      {sc.lines.map((v) => {
        const y = PAD.t + PH - (v / sc.top) * PH;
        return (
          <g key={v}>
            <line x1={PAD.l} x2={PAD.l + pw} y1={y} y2={y} className="ch-grid" />
            <text x={PAD.l - 8} y={y + 4} textAnchor="end" className="ch-axis">{fmt(v)}</text>
          </g>
        );
      })}
      {categories.map((c, i) => (
        <text key={c + i} x={PAD.l + bandW * (i + 0.5)} y={H - 12} textAnchor="middle" className="ch-axis">{c}</text>
      ))}
    </>
  );
}

// ── Gruplu sütun (aynı birimdeki 2-3 seri) ─────────────────
export function GroupedBarChart({ title, subtitle, note, categories, series, format }) {
  const [hover, setHover] = useState(null);
  const [ref, W] = useWidth();
  const PW = W - PAD.l - PAD.r;
  const max = Math.max(0, ...series.flatMap((s) => s.values.map((v) => v || 0)));
  const sc = scale(max);
  const bandW = PW / Math.max(1, categories.length);
  const groupW = bandW * 0.68;
  const barW = Math.max(3, (groupW - 2 * (series.length - 1)) / series.length);

  return (
    <Frame title={title} subtitle={subtitle} note={note} legend={series} empty={max <= 0}>
      <div className="ch-body" ref={ref} onMouseLeave={() => setHover(null)}>
        <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="ch-svg" role="img" aria-label={title}>
          <Axes sc={sc} categories={categories} fmt={format.axis} bandW={bandW} pw={PW} />
          {categories.map((c, i) => {
            const x0 = PAD.l + bandW * i + (bandW - groupW) / 2;
            return (
              <g key={c + i}>
                {series.map((s, j) => {
                  const v = s.values[i] || 0;
                  const h = (v / sc.top) * PH;
                  const x = x0 + j * (barW + 2);
                  return <path key={s.name} d={barPath(x, PAD.t + PH - h, barW, h)} fill={s.color} />;
                })}
                <rect x={PAD.l + bandW * i} y={PAD.t} width={bandW} height={PH} fill="transparent"
                  onMouseMove={(e) => {
                    const r = e.currentTarget.ownerSVGElement.parentElement.getBoundingClientRect();
                    setHover({ i, x: PAD.l + bandW * (i + 0.5), py: e.clientY - r.top - 8 });
                  }} />
              </g>
            );
          })}
          {hover && <line className="ch-cross" x1={hover.x} x2={hover.x} y1={PAD.t} y2={PAD.t + PH} />}
        </svg>
        <Tip hover={hover} w={W}>
          {hover && <>
            <b>{categories[hover.i]}</b>
            {series.map((s) => (
              <div key={s.name} className="ch-tip-row">
                <i style={{ background: s.color }} />{s.name}
                <span>{format.value(s.values[hover.i] || 0)}</span>
              </div>
            ))}
          </>}
        </Tip>
      </div>
    </Frame>
  );
}

// ── Yığılmış sütun (bir bütünün parçaları — adet dağılımı) ──
export function StackedBarChart({ title, subtitle, note, categories, series, format }) {
  const [hover, setHover] = useState(null);
  const [ref, W] = useWidth();
  const PW = W - PAD.l - PAD.r;
  const totals = categories.map((_, i) => series.reduce((s, se) => s + (se.values[i] || 0), 0));
  const max = Math.max(0, ...totals);
  const sc = scale(max);
  const bandW = PW / Math.max(1, categories.length);
  const barW = Math.min(38, bandW * 0.56);

  return (
    <Frame title={title} subtitle={subtitle} note={note} legend={series} empty={max <= 0}>
      <div className="ch-body" ref={ref} onMouseLeave={() => setHover(null)}>
        <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="ch-svg" role="img" aria-label={title}>
          <Axes sc={sc} categories={categories} fmt={format.axis} bandW={bandW} pw={PW} />
          {categories.map((c, i) => {
            const x = PAD.l + bandW * (i + 0.5) - barW / 2;
            let acc = 0;
            return (
              <g key={c + i}>
                {series.map((s, j) => {
                  const v = s.values[i] || 0;
                  if (v <= 0) return null;
                  const y = PAD.t + PH - ((acc + v) / sc.top) * PH;
                  const h = (v / sc.top) * PH;
                  acc += v;
                  const gap = j > 0 ? 2 : 0;           // parçalar arası yüzey boşluğu
                  const top = j === series.length - 1 || acc >= totals[i] - 1e-9;
                  return top
                    ? <path key={s.name} d={barPath(x, y, barW, Math.max(0, h - gap))} fill={s.color} />
                    : <rect key={s.name} x={x} y={y} width={barW} height={Math.max(0, h - gap)} fill={s.color} />;
                })}
                <rect x={PAD.l + bandW * i} y={PAD.t} width={bandW} height={PH} fill="transparent"
                  onMouseMove={(e) => {
                    const r = e.currentTarget.ownerSVGElement.parentElement.getBoundingClientRect();
                    setHover({ i, x: PAD.l + bandW * (i + 0.5), py: e.clientY - r.top - 8 });
                  }} />
              </g>
            );
          })}
        </svg>
        <Tip hover={hover} w={W}>
          {hover && <>
            <b>{categories[hover.i]}</b>
            {series.map((s) => (
              <div key={s.name} className="ch-tip-row">
                <i style={{ background: s.color }} />{s.name}
                <span>{format.value(s.values[hover.i] || 0)}</span>
              </div>
            ))}
            <div className="ch-tip-row total"><i />Toplam<span>{format.value(totals[hover.i])}</span></div>
          </>}
        </Tip>
      </div>
    </Frame>
  );
}

// ── Çizgi (zaman içindeki oran) ────────────────────────────
// values içinde `null` = o ay veri yok; çizgi kopar, uydurma yapılmaz.
export function LineChart({ title, subtitle, note, categories, series, format, yTop, refLine }) {
  const [hover, setHover] = useState(null);
  const [ref, W] = useWidth();
  const PW = W - PAD.l - PAD.r;
  const vals = series.flatMap((s) => s.values.filter((v) => v != null));
  const max = yTop ?? Math.max(0, ...vals);
  const sc = yTop ? { top: yTop, lines: [0, yTop / 4, yTop / 2, (3 * yTop) / 4, yTop] } : scale(max);
  const bandW = PW / Math.max(1, categories.length);
  const px = (i) => PAD.l + bandW * (i + 0.5);
  const py = (v) => PAD.t + PH - (v / sc.top) * PH;

  return (
    <Frame title={title} subtitle={subtitle} note={note} legend={series} empty={!vals.length}>
      <div className="ch-body" ref={ref} onMouseLeave={() => setHover(null)}>
        <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="ch-svg" role="img" aria-label={title}>
          <Axes sc={sc} categories={categories} fmt={format.axis} bandW={bandW} pw={PW} />
          {refLine != null && refLine <= sc.top && (
            <g>
              <line className="ch-ref" x1={PAD.l} x2={PAD.l + PW} y1={py(refLine)} y2={py(refLine)} />
              <text className="ch-ref-lbl" x={PAD.l + PW} y={py(refLine) - 6} textAnchor="end">Ortalama {format.value(refLine)}</text>
            </g>
          )}
          {series.map((s) => {
            // Kopuk seriyi tek path'te birleştirmemek için parçalara ayır.
            const segs = [];
            let cur = [];
            s.values.forEach((v, i) => {
              if (v == null) { if (cur.length) segs.push(cur); cur = []; }
              else cur.push([px(i), py(v)]);
            });
            if (cur.length) segs.push(cur);
            return (
              <g key={s.name}>
                {segs.map((sg, k) => (
                  <path key={k} className="ch-line" stroke={s.color}
                    d={sg.map(([x, y], i) => `${i ? 'L' : 'M'} ${x.toFixed(1)} ${y.toFixed(1)}`).join(' ')} />
                ))}
                {s.values.map((v, i) => v == null ? null : (
                  <circle key={i} cx={px(i)} cy={py(v)} r="4.5" fill={s.color} className="ch-dot" />
                ))}
              </g>
            );
          })}
          {categories.map((c, i) => (
            <rect key={c + i} x={PAD.l + bandW * i} y={PAD.t} width={bandW} height={PH} fill="transparent"
              onMouseMove={(e) => {
                const r = e.currentTarget.ownerSVGElement.parentElement.getBoundingClientRect();
                setHover({ i, x: px(i), py: e.clientY - r.top - 8 });
              }} />
          ))}
          {hover && <line className="ch-cross" x1={hover.x} x2={hover.x} y1={PAD.t} y2={PAD.t + PH} />}
        </svg>
        <Tip hover={hover} w={W}>
          {hover && <>
            <b>{categories[hover.i]}</b>
            {series.map((s) => (
              <div key={s.name} className="ch-tip-row">
                <i style={{ background: s.color }} />{s.name}
                <span>{s.values[hover.i] == null ? '—' : format.value(s.values[hover.i])}</span>
              </div>
            ))}
          </>}
        </Tip>
      </div>
    </Frame>
  );
}

// ── Iraksak yatay sütun (işaretli değişim: artış / azalış) ──
// Sıfır ortada durur; yön (sağ/sol) tek başına artı/eksiyi anlatır, renk
// yalnızca pekiştirir — kırmızı/yeşil ayırt edemeyen okuyucu da okur.
export function DivergingBarChart({ title, subtitle, note, rows, format, posColor, negColor }) {
  const [hover, setHover] = useState(null);
  const known = rows.filter((r) => r.value != null);
  const max = Math.max(0.0001, ...known.map((r) => Math.abs(r.value)));
  // Hiç eksi değer yoksa sıfırı ortaya koymak izlek genişliğinin yarısını
  // boşa harcar; o durumda çubuklar soldan başlar.
  const twoSided = known.some((r) => r.value < 0);
  const span = twoSided ? 50 : 100;
  return (
    <Frame title={title} subtitle={subtitle} note={note} empty={!known.length}>
      <div className="ch-dbars" onMouseLeave={() => setHover(null)}>
        {rows.map((r, i) => {
          const v = r.value;
          const w = v == null ? 0 : (Math.abs(v) / max) * span;
          return (
            <div key={r.label} className={`ch-dbar ${hover != null && hover !== i ? 'dim' : ''}`}
              onMouseEnter={() => setHover(i)}>
              <span className="ch-dbar-lbl" title={r.label}>{r.label}</span>
              <span className="ch-dbar-track">
                {twoSided && <span className="ch-dbar-zero" />}
                {v != null && (
                  <span className="ch-dbar-fill" style={{
                    width: `${w}%`,
                    [v >= 0 ? 'left' : 'right']: twoSided ? '50%' : '0',
                    background: v >= 0 ? posColor : negColor,
                    borderRadius: !twoSided ? '4px' : v >= 0 ? '0 4px 4px 0' : '4px 0 0 4px',
                  }} />
                )}
              </span>
              <span className={`ch-dbar-val ${v == null ? 'na' : v >= 0 ? 'pos' : 'neg'}`}>{format(v)}</span>
            </div>
          );
        })}
      </div>
    </Frame>
  );
}

// ── Yatay sütun (sıralı kırılım — uzun etiketler için) ─────
export function HBarChart({ title, subtitle, note, rows, color, format, max: maxProp }) {
  const [hover, setHover] = useState(null);
  const max = maxProp ?? Math.max(0, ...rows.map((r) => r.value));
  return (
    <Frame title={title} subtitle={subtitle} note={note} empty={!rows.length || max <= 0}>
      <div className="ch-hbars" onMouseLeave={() => setHover(null)}>
        {rows.map((r, i) => (
          <div key={r.label} className={`ch-hbar ${hover != null && hover !== i ? 'dim' : ''}`}
            onMouseEnter={() => setHover(i)}>
            <span className="ch-hbar-lbl" title={r.label}>{r.label}</span>
            <span className="ch-hbar-track">
              <span className="ch-hbar-fill" style={{ width: `${Math.max(1.5, (r.value / max) * 100)}%`, background: r.color || color }} />
            </span>
            <span className="ch-hbar-val">{format(r.value)}</span>
          </div>
        ))}
      </div>
    </Frame>
  );
}
