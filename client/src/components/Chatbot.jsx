import { useRef, useState, useEffect } from 'react';
import { askGemini } from '../lib/api.js';

// Floating AI advisor — faithful port of the legacy #ai-chat-btn widget.
// Bottom-right gold button -> bubble -> TSS/ÖSS selection -> chat.
export default function Chatbot() {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState('');           // '' | 'TSS' | 'OSS' | 'GSS'
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const msgsRef = useRef(null);

  useEffect(() => {
    if (msgsRef.current) msgsRef.current.scrollTop = msgsRef.current.scrollHeight;
  }, [messages, busy]);

  const titles = { TSS: 'TSS Danışmanı', OSS: 'ÖSS Danışmanı', GSS: 'GSS Danışmanı' };
  const greets = {
    TSS: 'Merhaba! 👋 Tamamlayıcı Sağlık Sigortası (TSS) hakkında sorularınızı yanıtlamaktan memnuniyet duyarım.',
    OSS: 'Merhaba! 👋 Özel Sağlık Sigortası (ÖSS) hakkında sorularınızı yanıtlamaktan memnuniyet duyarım.',
    GSS: 'Merhaba! 👋 Grup Sağlık Sigortası (GSS) hakkında sorularınızı yanıtlamaktan memnuniyet duyarım.',
  };

  function select(t) {
    setType(t);
    setMessages([{ role: 'bot', text: greets[t] }]);
    setTimeout(() => document.getElementById('ai-input')?.focus(), 120);
  }
  function reset() { setType(''); setMessages([]); }

  async function send(e) {
    e?.preventDefault();
    if (!type) return;
    const msg = input.trim();
    if (!msg || busy) return;
    setMessages((m) => [...m, { role: 'usr', text: msg }]);
    setInput('');
    setBusy(true);
    try {
      const r = await askGemini(msg, type);
      setMessages((m) => [...m, { role: 'bot', text: r.reply || r.error || 'Bir hata oluştu.' }]);
    } catch {
      setMessages((m) => [...m, { role: 'bot', text: 'Bağlantı hatası. Lütfen tekrar deneyin.' }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button className="ai-chat-btn" title="Sigorta Danışmanı" aria-label="Sigorta Danışmanı"
        onClick={() => setOpen((o) => !o)}>
        <svg viewBox="0 0 24 24"><path d="M20 2H4C2.9 2 2 2.9 2 4v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z" /></svg>
      </button>

      {open && (
        <div className="ai-chat-bubble">
          <div className="ai-hdr">
            <svg viewBox="0 0 24 24" width="22" height="22" style={{ fill: 'var(--gold)' }}>
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z" />
            </svg>
            <span>{type ? titles[type] : 'Sigorta Danışmanı'}</span>
            <button onClick={() => setOpen(false)} aria-label="Kapat">✕</button>
          </div>

          {!type ? (
            <div className="ai-sel">
              <p>📋 Hangi sigorta hakkında bilgi almak istersiniz?</p>
              <button className="ai-sel-btn" onClick={() => select('TSS')}>
                Tamamlayıcı Sağlık Sigortası <span className="ai-sel-badge">TSS</span>
              </button>
              <button className="ai-sel-btn" onClick={() => select('OSS')}>
                Özel Sağlık Sigortası <span className="ai-sel-badge">ÖSS</span>
              </button>
              <button className="ai-sel-btn" onClick={() => select('GSS')}>
                Grup Sağlık Sigortası <span className="ai-sel-badge">GSS</span>
              </button>
            </div>
          ) : (
            <div className="ai-main">
              <div className="ai-msgs" ref={msgsRef}>
                {messages.map((m, i) => (
                  <div key={i} className={`ai-m ${m.role}`}>{m.text}</div>
                ))}
                {busy && <div className="ai-m typ">Yanıt hazırlanıyor...</div>}
              </div>
              <button className="ai-reset" onClick={reset}>↩ Farklı sigorta türü seç</button>
              <form className="ai-inp" onSubmit={send}>
                <input id="ai-input" value={input} maxLength={600} placeholder="Sorunuzu yazın..."
                  onChange={(e) => setInput(e.target.value)} />
                <button type="submit" disabled={busy || !input.trim()}>Gönder</button>
              </form>
            </div>
          )}
        </div>
      )}
    </>
  );
}
