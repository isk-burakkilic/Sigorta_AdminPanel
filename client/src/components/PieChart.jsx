import { useState } from 'react';

const CX = 120, CY = 120, R = 112;
const polar = (angle) => [CX + R * Math.cos(angle), CY + R * Math.sin(angle)];

function arcPath(startAngle, pct) {
  const end = startAngle + pct * 2 * Math.PI;
  const [x1, y1] = polar(startAngle);
  const [x2, y2] = polar(end);
  const large = end - startAngle > Math.PI ? 1 : 0;
  return `M ${CX} ${CY} L ${x1.toFixed(2)} ${y1.toFixed(2)} A ${R} ${R} 0 ${large} 1 ${x2.toFixed(2)} ${y2.toFixed(2)} Z`;
}

const pctLabel = (p) => (p * 100).toFixed(p < 0.1 ? 1 : 0) + '%';

export default function PieChart({ title, subtitle, slices, format }) {
  const [hover, setHover] = useState(null); // { i, x, y }

  const hasData = slices.length > 0 && slices.some((s) => s.value > 0);
  let a = -Math.PI / 2;

  return (
    <div className="chart-card">
      <div className="chart-head">
        <h3>{title}</h3>
        {subtitle && <span className="chart-info" title={subtitle}>ⓘ</span>}
      </div>

      {!hasData ? (
        <div className="chart-empty">Veri bulunamadı</div>
      ) : (
        <>
          <div className="chart-body" onMouseLeave={() => setHover(null)}>
            <svg viewBox="0 0 240 240" className="pie-svg" role="img" aria-label={title}>
              {slices.length === 1 ? (
                <circle cx={CX} cy={CY} r={R} fill={slices[0].color} />
              ) : (
                slices.map((s, i) => {
                  const d = arcPath(a, s.pct);
                  a += s.pct * 2 * Math.PI;
                  return (
                    <path
                      key={s.label}
                      d={d}
                      fill={s.color}
                      stroke="#fff"
                      strokeWidth="2"
                      opacity={hover && hover.i !== i ? 0.4 : 1}
                      style={{ transition: 'opacity .15s', cursor: 'pointer' }}
                      onMouseMove={(e) => {
                        const r = e.currentTarget.ownerSVGElement.parentElement.getBoundingClientRect();
                        setHover({ i, x: e.clientX - r.left, y: e.clientY - r.top });
                      }}
                    />
                  );
                })
              )}
            </svg>

            {hover && (
              <div className="chart-tip" style={{ left: hover.x + 12, top: hover.y + 12 }}>
                <span className="tip-dot" style={{ background: slices[hover.i].color }} />
                <b>{slices[hover.i].label}</b>
                <div>{format(slices[hover.i].value)} · {pctLabel(slices[hover.i].pct)}</div>
              </div>
            )}
          </div>

          <div className="chart-legend">
            {slices.map((s, i) => (
              <div
                key={s.label}
                className={`legend-item ${hover && hover.i !== i ? 'dim' : ''}`}
                onMouseEnter={() => setHover((h) => ({ i, x: (h?.x ?? 120), y: (h?.y ?? 120) }))}
                onMouseLeave={() => setHover(null)}
              >
                <span className="legend-dot" style={{ background: s.color }} />
                <span className="legend-label">{s.label}</span>
                <span className="legend-val">{format(s.value)}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
