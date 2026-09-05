// ============================================================
//  NotificationBell.jsx — üst bardaki bildirim zili.
//
//  Konum: topbar sağ blok, AYARLAR dişlisinin SOLUNDA (dişli ve "CANLI"
//  rozeti aynen yerinde kalır).
//
//  İçerik: Takip Edilen İşler'den, hatırlatma penceresine girmiş işler
//  (`/api/takip?action=notifications`). Kalan gün hesabı SUNUCUDA yapılır —
//  zilde yazan gün ile e-postada yazan gün asla ayrışmasın diye.
//
//  OKUNDU DURUMU İSTEMCİDE TUTULUR (localStorage), sunucuda değil:
//    • Anahtar `id:bitisTarihi` — poliçe bitişi düzenlenirse kayıt yeniden
//      okunmamış sayılır ve kullanıcı tekrar uyarılır. Doğru davranış budur.
//    • Kullanıcı+acente bazlı anahtar; aynı tarayıcıyı paylaşan iki çalışanın
//      rozetleri birbirine karışmaz.
//    • Bilinçli tercih: "okundu" kişisel bir tercihtir, acente verisi değil.
//      Sunucuya taşımak her kullanıcı için ayrı tablo demekti; e-posta zaten
//      kalıcı kaydı tutuyor.
//
//  Yenileme: açılışta, POLL_MS'de bir, sekmeye geri dönüldüğünde ve zil
//  açıldığında. Oturum düşerse (401) api.js global olayı fırlatır; burada
//  sessizce durulur, kırmızı hata basılmaz.
// ============================================================
import { useCallback, useEffect, useRef, useState } from 'react';
import { takip } from '../lib/api.js';

const POLL_MS = 5 * 60 * 1000; // 5 dk — bildirimler gün ölçeğinde değişir, sık çekmenin anlamı yok

const storeKey = (tenant, user) => `zp-bildirim-okundu:${tenant || '-'}:${user || '-'}`;
// Bir bildirimin kimliği: id + bitiş tarihi. Tarih değişirse yeniden bildirilir.
const notifKey = (n) => `${n.id}:${String(n.police_bitis || '').slice(0, 10)}`;

function readSeen(key) {
  try { return new Set(JSON.parse(localStorage.getItem(key) || '[]')); } catch { return new Set(); }
}
function writeSeen(key, set) {
  // Sınırsız büyümesin: en yeni 300 kayıt yeter (bildirimler zaten eskiyince düşer).
  try { localStorage.setItem(key, JSON.stringify([...set].slice(-300))); } catch { /* kota dolu */ }
}

// İş türüne göre metin: poliçe bitişi mi, tahsilat mı (server → is_turu).
function kalanMetin(k, tur = 'police') {
  if (!Number.isFinite(k)) return '';
  const tahsilat = tur === 'tahsilat';
  if (k < 0) return `${Math.abs(k)} gün geçti`;
  if (k === 0) return tahsilat ? 'Tahsilat günü bugün' : 'Bugün bitiyor';
  if (k === 1) return tahsilat ? 'Tahsilat günü yarın' : 'Yarın bitiyor';
  return tahsilat ? `Tahsilata ${k} gün var` : `Poliçe bitimine ${k} gün var`;
}

export default function NotificationBell({ tenant, user, onOpenTakip }) {
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [seen, setSeen] = useState(() => readSeen(storeKey(tenant, user)));
  const wrapRef = useRef(null);
  const key = storeKey(tenant, user);

  // Kullanıcı/acente değişirse (admin acente değiştirdi) okundu kümesi de değişir.
  useEffect(() => { setSeen(readSeen(key)); }, [key]);

  const load = useCallback(async () => {
    const r = await takip.notifications();
    if (r?.ok) setItems(Array.isArray(r.data) ? r.data : []);
    // Hata durumunda sessiz kal: zil, panelin ana işini bozmamalı.
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, POLL_MS);
    // Sekmeye geri dönünce tazele — panel gün boyu açık kalıyor.
    const onFocus = () => load();
    window.addEventListener('focus', onFocus);
    return () => { clearInterval(t); window.removeEventListener('focus', onFocus); };
  }, [load]);

  // Dışarı tıklama ve Escape ile kapan.
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const unread = items.filter((n) => !seen.has(notifKey(n)));

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next) load();
  }

  function markAllRead() {
    const s = new Set(seen);
    for (const n of items) s.add(notifKey(n));
    setSeen(s); writeSeen(key, s);
  }

  function markRead(n) {
    const s = new Set(seen); s.add(notifKey(n));
    setSeen(s); writeSeen(key, s);
  }

  function goTakip(n) {
    markRead(n);
    setOpen(false);
    onOpenTakip?.();
  }

  return (
    <div className="topbar-bell-wrap" ref={wrapRef}>
      <button className={`topbar-bell ${open ? 'active' : ''} ${unread.length ? 'has-unread' : ''}`}
        onClick={toggle} aria-label="Bildirimler" aria-expanded={open}
        title={unread.length ? `${unread.length} okunmamış bildirim` : 'Bildirimler'}>
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor"
          strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unread.length > 0 && (
          <span className="bell-badge">{unread.length > 99 ? '99+' : unread.length}</span>
        )}
      </button>

      {open && (
        <div className="bell-panel" role="dialog" aria-label="Bildirimler">
          <div className="bell-hd">
            <span>Bildirimler</span>
            {items.length > 0 && unread.length > 0 && (
              <button className="bell-mark" onClick={markAllRead}>Tümünü okundu işaretle</button>
            )}
          </div>

          {!items.length ? (
            <div className="bell-empty">
              <div className="bell-empty-icon">🔔</div>
              <p>Şu an bildirim yok.</p>
              <p className="bell-empty-sub">
                Takip Edilen İşler’e eklediğiniz bir poliçenin bitişine ya da bir
                tahsilatın gününe, seçtiğiniz kadar kalınca burada uyarı çıkar.
              </p>
            </div>
          ) : (
            <div className="bell-list">
              {items.map((n) => {
                const isNew = !seen.has(notifKey(n));
                return (
                  <button key={notifKey(n)} className={`bell-item ${n.aciliyet} ${isNew ? 'new' : ''}`}
                    onClick={() => goTakip(n)}>
                    <span className={`bell-dot ${n.aciliyet}`} />
                    <span className="bell-body">
                      <span className="bell-name">{n.musteri_adi}</span>
                      <span className="bell-line">
                        <strong>{n.bitisTR}</strong> — {kalanMetin(n.kalanGun, n.is_turu)}
                      </span>
                      {(n.police_no || n.sigorta_sirketi || n.police_turu) && (
                        <span className="bell-meta">
                          {[n.police_no, n.sigorta_sirketi, n.police_turu].filter(Boolean).join(' · ')}
                        </span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          <button className="bell-foot" onClick={() => { setOpen(false); onOpenTakip?.(); }}>
            Takip Edilen İşler’i aç →
          </button>
        </div>
      )}
    </div>
  );
}
