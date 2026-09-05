// ============================================================
//  theme.js — light/dark theme preference (per browser).
//  Sets <html data-theme="..."> and persists to localStorage.
// ============================================================
const KEY = 'ahenk-theme';

export function getTheme() {
  return localStorage.getItem(KEY) === 'dark' ? 'dark' : 'light';
}

export function applyTheme(theme) {
  const t = theme === 'dark' ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', t);
  localStorage.setItem(KEY, t);
  // Topbar toggle ve Ayarlar → Kişiselleştirme aynı anda ekranda olabilir;
  // biri değiştirince öteki de haberdar olsun diye olay yayınlanır.
  window.dispatchEvent(new CustomEvent('zp:theme-changed', { detail: t }));
  return t;
}

// Apply the saved preference immediately on import (before render → no flash).
applyTheme(getTheme());
