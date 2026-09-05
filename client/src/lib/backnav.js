/* ══════════════════════════════════════════════════════════
   backnav.js — uygulama içi "geri" yığını.

   Panel tek bir React sayfasıdır (/panel); ekranlar bileşen state'i ile
   değişir, adres çubuğu değişmez. Bu yüzden tarayıcının geçmişi bizim
   ekranlarımızı bilmez: geri tuşu kullanıcıyı bir alt ekrana değil,
   doğrudan panelden dışarı atar. Çözüm kendi yığınımız:

   - Her katman (ay görünümü, ayar alt sayfası, kontak arama, düzenleyici…)
     açılırken `useBackLevel` ile kendi geri davranışını kaydeder, kapanınca
     otomatik siler.
   - Üst bardaki Geri butonu (`goBack`) ve tarayıcının/telefonun geri tuşu
     daima EN ÜSTTEKİ katmanı kapatır — ikisi de aynı yığını kullanır.
   - `installBackGuard` tarayıcı geçmişine bir "bekçi" kaydı bırakır. Geri
     tuşu bu kaydı tüketir, biz de anında yenisini basarız; böylece kullanıcı
     yanlışlıkla sayfadan (ve sekmeye bağlı oturumdan) çıkmaz.
   ══════════════════════════════════════════════════════════ */
import { useEffect, useRef, useState } from 'react';

const stack = [];        // [{ label, run }] — sonuncu = en üstteki katman
const subs = new Set();  // Geri butonunu güncelleyen aboneler

const top = () => (stack.length ? stack[stack.length - 1] : null);
const emit = () => { const t = top(); subs.forEach((fn) => fn(t)); };

/** Katmanı yığına ekler; dönen fonksiyon katmanı yığından çıkarır. */
function pushLevel(level) {
  stack.push(level);
  emit();
  return () => {
    const i = stack.indexOf(level);
    if (i !== -1) { stack.splice(i, 1); emit(); }
  };
}

/** En üstteki katmanı kapatır. Kapatacak bir şey yoksa false döner. */
export function goBack() {
  const level = top();
  if (!level) return false;
  level.run();
  return true;
}

/**
 * Bir ekranı/katmanı geri yığınına bağlar.
 * @param {boolean}  active  katman şu anda açık mı
 * @param {string}   label   Geri butonunda gösterilecek hedef ("Üretim Listesi")
 * @param {Function} run     katmanı kapatan fonksiyon
 */
export function useBackLevel(active, label, run) {
  const runRef = useRef(run);
  const levelRef = useRef(null);
  useEffect(() => { runRef.current = run; });   // her commit'te taze closure

  useEffect(() => {
    if (!active) { levelRef.current = null; return undefined; }
    const level = { label, run: () => runRef.current() };
    levelRef.current = level;
    return pushLevel(level);
    // `label` bilerek bağımlılık DEĞİL: değiştiğinde katman yeniden
    // kaydedilseydi yığının tepesine çıkar ve sıralama bozulurdu.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  // Etiket değişimini yerinde uygula — sıra korunur.
  useEffect(() => {
    const level = levelRef.current;
    if (level && level.label !== label) { level.label = label; emit(); }
  }, [label]);
}

/** Geri butonunun hedefi: `{ label }` ya da kök ekrandaysak `null`. */
export function useBackTarget() {
  const [target, setTarget] = useState(top);
  useEffect(() => {
    subs.add(setTarget);
    setTarget(top());        // abone olana kadar değişmiş olabilir
    return () => { subs.delete(setTarget); };
  }, []);
  return target;
}

const GUARD = 'zpBackGuard';

/**
 * Tarayıcı geri tuşunu uygulama içine bağlar.
 * @param {Function} onBlocked kök ekrandayken geri denendiğinde çağrılır
 * @returns {Function} temizleyici
 */
export function installBackGuard(onBlocked) {
  // Geçmişin tepesinde her zaman bir bekçi kaydı dursun. Aynı URL'e
  // pushState yapıyoruz (adres değişmez), router state'i korunur.
  const ensure = () => {
    const st = window.history.state;
    if (!st || !st[GUARD]) window.history.pushState({ ...(st || {}), [GUARD]: true }, '');
  };
  ensure();

  const onPop = () => {
    const handled = goBack();
    ensure();                 // tüketilen bekçinin yerine yenisini koy
    if (!handled) onBlocked?.();
  };
  window.addEventListener('popstate', onPop);
  return () => window.removeEventListener('popstate', onPop);
}

/**
 * Esc tuşunu geri tuşuyla aynı yığına bağlar: en üstteki katmanı kapatır.
 * Kök ekrandayken (kapatacak katman yokken) hiçbir şey yapmaz.
 * @returns {Function} temizleyici
 */
export function installEscGuard() {
  const onKey = (e) => { if (e.key === 'Escape') goBack(); };
  window.addEventListener('keydown', onKey);
  return () => window.removeEventListener('keydown', onKey);
}
