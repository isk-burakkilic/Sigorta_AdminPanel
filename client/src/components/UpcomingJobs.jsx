// ============================================================
//  UpcomingJobs.jsx — ANA SAYFA: "Yaklaşan İşler" ajanda kartı
//
//  Ana sayfa şimdiye kadar yalnızca geçmişi anlatıyordu (üretim, satış,
//  toplamlar). Bu kart YARINI anlatır: önümüzdeki günlerde bitiş tarihi ya da
//  tahsilat günü gelen Takip Edilen İşler. Amaç, paneli açan kişinin "bugün
//  ne yapmam gerekiyor" sorusunu ilk ekranda cevaplaması.
//
//  ⚠️ Kaç gün kaldığını BURADA HESAPLAMIYORUZ. Sunucu her kayda `kalanGun`,
//  `bitisTR`, `aciliyet` ekleyerek döner (server/src/takip.js) — mailde,
//  zilde ve ekranda aynı sayı görünsün diye (bkz. CLAUDE.md §8).
//
//  Zil (NotificationBell) ile farkı bilinçlidir:
//    • Zil  → yalnızca kaydın KENDİ hatırlatma penceresine girmiş işler.
//    • Kart → türünden ve hatırlatma ayarından bağımsız olarak, ufuktaki
//             (varsayılan 30 gün) TÜM takipteki işler + süresi geçmişler.
//  Yani "gün geldiğinde" ayarlı bir tahsilat zilde daha görünmezken bu
//  kartta günler öncesinden görünür — ajandanın işi budur.
// ============================================================
import { useEffect, useMemo, useState } from 'react';
import { takip } from '../lib/api.js';

const UFUK_GUN = 30;   // kaç güne kadar olan işler ajandaya girer
const EN_FAZLA = 6;    // karta sığan satır sayısı; gerisi "Tümü" ekranında

const turu = (r) => (r?.is_turu === 'tahsilat' ? 'tahsilat' : 'police');

/** Kısa, göz taramasına uygun metin. */
function kalanMetin(k, tur) {
  if (!Number.isFinite(k)) return '';
  const tahsilat = tur === 'tahsilat';
  if (k < 0) return `${Math.abs(k)} gün gecikti`;
  if (k === 0) return tahsilat ? 'Bugün tahsilat' : 'Bugün bitiyor';
  if (k === 1) return tahsilat ? 'Yarın tahsilat' : 'Yarın bitiyor';
  return `${k} gün kaldı`;
}

/** '11.09.2026' → { gun: '11', ay: 'EYL' } — takvim yaprağı için. */
const AYLAR = ['OCA', 'ŞUB', 'MAR', 'NİS', 'MAY', 'HAZ', 'TEM', 'AĞU', 'EYL', 'EKİ', 'KAS', 'ARA'];
function takvim(bitisTR) {
  const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(String(bitisTR || ''));
  return m ? { gun: m[1], ay: AYLAR[+m[2] - 1] || '' } : { gun: '—', ay: '' };
}

export default function UpcomingJobs({ onOpen }) {
  const [rows, setRows] = useState(null);   // null = yükleniyor, [] = veri yok

  useEffect(() => {
    let iptal = false;
    takip.list()
      .then((r) => { if (!iptal) setRows(r?.ok ? r.data : []); })
      // Ajanda ana sayfayı bloke etmez: hata olursa kart sessizce boş görünür,
      // grafikler ve toplamlar etkilenmez.
      .catch(() => { if (!iptal) setRows([]); });
    return () => { iptal = true; };
  }, []);

  const { liste, toplam, gecikmis } = useMemo(() => {
    const all = (rows || []).filter((r) => r.durum === 'takipte' && Number.isFinite(r.kalanGun));
    const ufukta = all.filter((r) => r.kalanGun <= UFUK_GUN).sort((a, b) => a.kalanGun - b.kalanGun);
    return {
      liste: ufukta.slice(0, EN_FAZLA),
      toplam: ufukta.length,
      gecikmis: ufukta.filter((r) => r.kalanGun < 0).length,
    };
  }, [rows]);

  return (
    <section className="agenda-card">
      <div className="agenda-head">
        <div>
          <h3>Yaklaşan İşler</h3>
          <p className="agenda-sub">
            {rows === null ? 'Yükleniyor…'
              : toplam
                ? `Önümüzdeki ${UFUK_GUN} gün · ${toplam} iş${gecikmis ? ` · ${gecikmis} gecikmiş` : ''}`
                : `Önümüzdeki ${UFUK_GUN} gün`}
          </p>
        </div>
        <button className="agenda-all" onClick={onOpen}>Tümü →</button>
      </div>

      {rows === null ? (
        <div className="agenda-empty">Yükleniyor…</div>
      ) : !liste.length ? (
        <div className="agenda-empty">
          <div className="agenda-empty-icon">🗓️</div>
          <p>Önümüzdeki {UFUK_GUN} günde takip edilen iş yok.</p>
          <button className="btn btn-ghost" onClick={onOpen}>Takip Edilen İşler’i aç</button>
        </div>
      ) : (
        <ul className="agenda-list">
          {liste.map((r) => {
            const t = turu(r);
            const d = takvim(r.bitisTR);
            return (
              <li key={r.id}>
                <button className={`agenda-item ${r.aciliyet}`} onClick={onOpen}
                  title={`${r.musteri_adi} — ${r.bitisTR}`}>
                  <span className="agenda-date">
                    <span className="agenda-day">{d.gun}</span>
                    <span className="agenda-mon">{d.ay}</span>
                  </span>
                  <span className="agenda-body">
                    <span className="agenda-name">{r.musteri_adi}</span>
                    <span className="agenda-meta">
                      <span className={`agenda-tur ${t}`}>{t === 'tahsilat' ? '₺ Tahsilat' : 'Poliçe'}</span>
                      {r.sigorta_sirketi && <span className="agenda-firm">{r.sigorta_sirketi}</span>}
                    </span>
                  </span>
                  <span className={`agenda-left ${r.aciliyet}`}>{kalanMetin(r.kalanGun, t)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
