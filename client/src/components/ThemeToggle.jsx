// ============================================================
//  ThemeToggle.jsx — üst bardaki açık/karanlık mod düğmesi.
//
//  Konum: topbar sağ blok, bildirim ziliyle ayarlar dişlisi ARASINDA.
//  Ayarlar → Kişiselleştirme'deki anahtarla AYNI kaynağı kullanır
//  (`lib/theme.js`); ikisi birden ekrandaysa `zp:theme-changed` olayı
//  sayesinde birbirini geride bırakmaz.
// ============================================================
import { useEffect, useState } from 'react';
import { getTheme, applyTheme } from '../lib/theme.js';

export default function ThemeToggle() {
  const [dark, setDark] = useState(() => getTheme() === 'dark');

  useEffect(() => {
    const onChange = (e) => setDark(e.detail === 'dark');
    window.addEventListener('zp:theme-changed', onChange);
    return () => window.removeEventListener('zp:theme-changed', onChange);
  }, []);

  function toggle() {
    applyTheme(dark ? 'light' : 'dark');
  }

  return (
    <button className="topbar-theme" onClick={toggle}
      title={dark ? 'Aydınlık moda geç' : 'Karanlık moda geç'}
      aria-label={dark ? 'Aydınlık moda geç' : 'Karanlık moda geç'}>
      {dark ? (
        <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="4.6" />
          <path d="M12 2.5v2.4M12 19.1v2.4M4.9 4.9l1.7 1.7M17.4 17.4l1.7 1.7M2.5 12h2.4M19.1 12h2.4M4.9 19.1l1.7-1.7M17.4 6.6l1.7-1.7" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20.6 15.2A8.7 8.7 0 1 1 8.8 3.4a7 7 0 0 0 11.8 11.8Z" />
        </svg>
      )}
    </button>
  );
}
