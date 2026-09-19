export function initialTheme() {
  try {
    const saved = localStorage.getItem('contract-tracker-theme');
    if (saved === 'dark' || saved === 'light') return saved;
  } catch { /* Storage can be disabled. */ }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}
export function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  try { localStorage.setItem('contract-tracker-theme', theme); } catch { /* Optional persistence. */ }
}
