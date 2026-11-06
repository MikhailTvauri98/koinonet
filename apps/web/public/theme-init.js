// Classic parser-blocking script: runs before styles and application startup.
;(function () {
  let theme = 'dark'
  try {
    if (window.localStorage.getItem('church.ui.theme') === 'light') theme = 'light'
  } catch {
    // The dark CSS default also works when device storage is unavailable.
  }
  document.documentElement.dataset.theme = theme
  document.documentElement.style.colorScheme = theme
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', theme === 'light' ? '#f5f6f9' : '#141719')
})()
