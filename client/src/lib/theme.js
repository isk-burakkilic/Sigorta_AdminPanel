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
  return t;
}

// Apply the saved preference immediately on import (before render → no flash).
applyTheme(getTheme());
