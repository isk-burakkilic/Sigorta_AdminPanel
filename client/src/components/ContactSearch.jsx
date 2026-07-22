import { useEffect, useMemo, useRef, useState } from 'react';
import { filterContacts } from '../lib/contacts.js';
import Customer360 from './Customer360.jsx';

const MAX_LIST = 100; // cap the rendered list for large customer bases

export default function ContactSearch({ contacts, loading, onClose, onOpenPolicy }) {
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(null);
  const inputRef = useRef(null);

  useEffect(() => { if (!sel) inputRef.current?.focus(); }, [sel]);
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') { if (sel) setSel(null); else onClose(); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, sel]);

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
