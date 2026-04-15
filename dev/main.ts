import { devlens, networkPlugin, repaintsPlugin, consolePlugin, a11yTabOrderPlugin, a11yClickAuditPlugin, a11yAuditPlugin, seoPlugin, headingsPlugin } from '../src/index'

devlens({
  plugins: [
    {
      name: 'Info',
      icon: '📋',
      panel: () => `
        <div style="display:flex;flex-direction:column;gap:8px;">
          <div><strong>URL:</strong> ${location.href}</div>
          <div><strong>Viewport:</strong> ${innerWidth}×${innerHeight}</div>
          <div><strong>User Agent:</strong> ${navigator.userAgent.slice(0, 80)}…</div>
          <div><strong>Language:</strong> ${navigator.language}</div>
          <div><strong>Color Scheme:</strong> ${matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'}</div>
        </div>
      `,
    },
    {
      name: 'Performance',
      icon: '⚡',
      panel: () => {
        const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming
        return `
          <div style="display:flex;flex-direction:column;gap:8px;">
            <div><strong>DOM Ready:</strong> ${Math.round(nav.domContentLoadedEventEnd)}ms</div>
            <div><strong>Load:</strong> ${Math.round(nav.loadEventEnd)}ms</div>
            <div><strong>TTFB:</strong> ${Math.round(nav.responseStart - nav.requestStart)}ms</div>
            <div><strong>Resources:</strong> ${performance.getEntriesByType('resource').length}</div>
          </div>
        `
      },
    },
    networkPlugin(),
    repaintsPlugin(),
    consolePlugin(),
    a11yTabOrderPlugin(),
    a11yClickAuditPlugin(),
    a11yAuditPlugin(),
    seoPlugin(),
    headingsPlugin(),
  ],
})

// Demo interactions
const counterEl = document.getElementById('counter-value')!
const btnIncrement = document.getElementById('btn-increment')!
const btnSpam = document.getElementById('btn-spam')!
const btnTicker = document.getElementById('btn-ticker')!
const tickerEl = document.getElementById('ticker')!
const btnColor = document.getElementById('btn-color')!
const colorBox = document.getElementById('color-box')!

let count = 0

btnIncrement.addEventListener('click', () => {
  count++
  counterEl.textContent = String(count)
})

btnSpam.addEventListener('click', () => {
  for (let i = 0; i < 50; i++) {
    setTimeout(() => {
      count++
      counterEl.textContent = String(count)
    }, i * 20)
  }
})

let tickerInterval: ReturnType<typeof setInterval> | null = null
btnTicker.addEventListener('click', () => {
  if (tickerInterval) {
    clearInterval(tickerInterval)
    tickerInterval = null
    btnTicker.textContent = 'Start ticker'
    tickerEl.textContent = ''
  } else {
    tickerInterval = setInterval(() => {
      tickerEl.textContent = new Date().toLocaleTimeString()
    }, 500)
    btnTicker.textContent = 'Stop ticker'
  }
})

btnColor.addEventListener('click', () => {
  const hue = Math.floor(Math.random() * 360)
  colorBox.style.background = `hsl(${hue}, 70%, 75%)`
})

document.getElementById('btn-error')!.addEventListener('click', () => {
  console.error('Something went wrong!', { code: 500, path: '/api/users' })
})

document.getElementById('btn-warn')!.addEventListener('click', () => {
  console.warn('Deprecated: use fetchV2() instead of fetch()')
})
