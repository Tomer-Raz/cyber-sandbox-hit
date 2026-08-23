// Paints the correct background before React mounts, otherwise dark-mode users
// get a white flash. ThemeProvider takes over with real antd tokens.
//
// A file rather than an inline <script> in index.html so the CSP can be
// `script-src 'self'` with no 'unsafe-inline' and no hash to keep in sync. It
// is loaded synchronously from <head>, so it still runs before first paint.
;(function () {
  try {
    var stored = localStorage.getItem('sbx.theme')
    var dark =
      stored === 'dark' ||
      ((stored === 'system' || !stored) &&
        window.matchMedia('(prefers-color-scheme: dark)').matches)
    var root = document.documentElement
    root.style.colorScheme = dark ? 'dark' : 'light'
    root.dataset.theme = dark ? 'dark' : 'light'
    root.style.backgroundColor = dark ? '#000' : '#f5f5f5'
  } catch (e) {}
})()
