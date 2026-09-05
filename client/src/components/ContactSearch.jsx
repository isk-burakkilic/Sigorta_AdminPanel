import { useEffect, useMemo, useRef, useState } from 'react';
import { filterContacts } from '../lib/contacts.js';
import { useBackLevel } from '../lib/backnav.js';
import Customer360 from './Customer360.jsx';

const MAX_LIST = 100; // cap the rendered list for large customer bases

// `paused` — üstte poliçe düzenleyici açıkken bu panel arkada durur:
// odağı düzenleyiciye bırakır. Escape ayrıca bekletilmez: backnav.js'teki
// katman yığını zaten düzenleyiciyi üstte tutar, `installEscGuard` (Panel.jsx)
// Escape'i her zaman en üstteki katmana yönlendirir.
export default function ContactSearch({ contacts, loading, paused = false, onClose, onOpenPolicy }) {
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(null);
  const inputRef = useRef(null);

  useEffect(() => { if (!sel && !paused) inputRef.current?.focus(); }, [sel, paused]);
  // Müşteri 360 ekranı da bir geri katmanıdır: geri tuşu (ve Escape) kişi listesine döner.
  // Panelin kendisi (kapanışı = onClose) zaten Panel.jsx'te `contactsOpen` katmanı olarak kayıtlı.
  useBackLevel(!!sel, 'Kişiler', () => setSel(null));

  // Poliçe kaydedilip/silinip liste yenilendiğinde seçili müşteriyi TAZE
  // nesneyle değiştir — açık duran Müşteri 360 ekranı güncel veriyi gösterir.
  // Müşteri listeden düştüyse (son poliçesi silindi) kişi listesine dön.
  useEffect(() => {
    if (!sel || !contacts.length) return;
    const fresh = contacts.find((c) => c.id === sel.id);
    if (!fresh) setSel(null);
    else if (fresh !== sel) setSel(fresh);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contacts]);

  // Not: liste bilerek SADE tutulur — isim + kimlik satırı. Cari bakiye burada
  // gösterilmez (rozet kaldırıldı); bakiye müşterinin Cari Hesap sekmesinde.

  // Live typeahead — filters as you type (input is uppercased in filterContacts).
  const results = useMemo(() => filterContacts(contacts, q), [contacts, q]);
  const shown = results.slice(0, MAX_LIST);

  // Selecting a customer expands into the full-screen Customer 360 view.
  if (sel) return <Customer360 contact={sel} onBack={() => setSel(null)} onClose={onClose} onOpenPolicy={onOpenPolicy} />;

  return (
    <div className="ks-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="ks-modal ks-modal-search" role="dialog" aria-modal="true" aria-label="Kontak Arama">
        <div className="ks-head">
          <strong>🔎 Kontak Arama</strong>
          <button className="modal-close" onClick={onClose} aria-label="Kapat">×</button>
        </div>

        <div className="ks-search">
          <input
            ref={inputRef}
            value={q}
            placeholder="İsim veya TC yazın… (küçük harf de olur)"
            onChange={(e) => setQ(e.target.value.toLocaleUpperCase('tr-TR'))}
            autoComplete="off"
          />
          <span className="ks-count">{loading ? 'Yükleniyor…' : `${results.length} kişi`}</span>
        </div>

        <div className="ks-listwrap">
          {loading && <div className="ks-empty">Kişiler yükleniyor…</div>}
          {!loading && !shown.length && <div className="ks-empty">Eşleşen kişi yok.</div>}
          {shown.map((c) => (
            <button key={c.id} className="ks-item" onClick={() => setSel(c)}>
              <div className="ks-item-name">{c.name || '(isimsiz)'}</div>
              <div className="ks-item-sub">{c.tc ? `TC: ${c.tc}` : 'TC yok'} · {c.policies.length} poliçe</div>
              <span className="ks-item-go">→</span>
            </button>
          ))}
          {results.length > MAX_LIST && <div className="ks-more">+{results.length - MAX_LIST} kişi daha… aramayı daraltın</div>}
        </div>
      </div>
    </div>
  );
}
