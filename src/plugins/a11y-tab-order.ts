/**
 * Tab Order plugin — numbers every focusable element on the page in the
 * order the keyboard will visit them, so tab traps and positive tabindex
 * values become visible.
 */
import type { DevLensPlugin } from '../types.js'

const STORAGE_KEY = 'devlens:a11y-tab'
const OVERLAY_CLASS = 'devlens-tab-badge'

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
  'summary',
  '[contenteditable="true"]',
  '[role="button"]',
  '[role="link"]',
  '[role="tab"]',
  '[role="menuitem"]',
].join(',')

function loadActive(): boolean {
  try { return localStorage.getItem(STORAGE_KEY) === '1' } catch { return false }
}

function saveActive(v: boolean) {
  try { localStorage.setItem(STORAGE_KEY, v ? '1' : '0') } catch {}
}

function injectBadgeStyles() {
  if (document.getElementById('devlens-tab-styles')) return
  const style = document.createElement('style')
  style.id = 'devlens-tab-styles'
  style.textContent = `
    .${OVERLAY_CLASS} {
      position: absolute;
      z-index: 999996;
      pointer-events: none;
      border: 2px solid rgba(99, 102, 241, 0.7);
      border-radius: 4px;
      background: rgba(99, 102, 241, 0.08);
    }
    .${OVERLAY_CLASS}__num {
      position: absolute;
      top: -10px;
      left: -10px;
      min-width: 20px;
      height: 20px;
      line-height: 20px;
      text-align: center;
      border-radius: 10px;
      background: #6366f1;
      color: #fff;
      font-size: 11px;
      font-weight: 700;
      font-family: ui-monospace, monospace;
      padding: 0 5px;
      box-shadow: 0 1px 4px rgba(0,0,0,0.3);
    }
  `
  document.head.append(style)
}

export function a11yTabOrderPlugin(): DevLensPlugin {
  let active = loadActive()
  let badges: HTMLElement[] = []
  let scrollHandler: (() => void) | null = null
  let resizeHandler: (() => void) | null = null
  let refreshTimer: ReturnType<typeof setInterval> | null = null

  function getFocusableElements(): HTMLElement[] {
    return [...document.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)]
      .filter((el) => {
        if (el.closest('#devlens')) return false
        const style = getComputedStyle(el)
        return style.display !== 'none' && style.visibility !== 'hidden' && el.offsetParent !== null
      })
  }

  function clearBadges() {
    for (const b of badges) b.remove()
    badges = []
  }

  function renderBadges() {
    clearBadges()
    if (!active) return

    const elements = getFocusableElements()
    const scrollX = window.scrollX
    const scrollY = window.scrollY

    for (let i = 0; i < elements.length; i++) {
      const el = elements[i]
      const rect = el.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) continue

      const badge = document.createElement('div')
      badge.className = OVERLAY_CLASS
      badge.setAttribute('data-devlens', '')
      badge.style.left = `${rect.left + scrollX}px`
      badge.style.top = `${rect.top + scrollY}px`
      badge.style.width = `${rect.width}px`
      badge.style.height = `${rect.height}px`

      const num = document.createElement('span')
      num.className = `${OVERLAY_CLASS}__num`
      num.textContent = String(i + 1)
      badge.append(num)

      document.body.append(badge)
      badges.push(badge)
    }
  }

  function start() {
    if (active) return
    active = true
    saveActive(true)
    injectBadgeStyles()
    renderBadges()
    scrollHandler = () => renderBadges()
    resizeHandler = () => renderBadges()
    window.addEventListener('scroll', scrollHandler, { passive: true })
    window.addEventListener('resize', resizeHandler)
    refreshTimer = setInterval(renderBadges, 3000)
  }

  function stop() {
    if (!active) return
    active = false
    saveActive(false)
    clearBadges()
    if (scrollHandler) window.removeEventListener('scroll', scrollHandler)
    if (resizeHandler) window.removeEventListener('resize', resizeHandler)
    if (refreshTimer) clearInterval(refreshTimer)
    scrollHandler = null
    resizeHandler = null
    refreshTimer = null
  }

  if (active) {
    active = false
    start()
  }

  return {
    name: 'Tab Order',
    icon: '🔢',

    panel() {
      const el = document.createElement('div')
      el.className = 'devlens-tab-order'
      return el
    },

    onMount(container) {
      const root = container.querySelector('.devlens-tab-order') as HTMLElement

      const render = () => {
        const elements = getFocusableElements()

        const breakdown: Record<string, number> = {}
        for (const el of elements) {
          const tag = el.tagName.toLowerCase()
          const role = el.getAttribute('role')
          const key = role ? `[role="${role}"]` : tag
          breakdown[key] = (breakdown[key] || 0) + 1
        }

        const breakdownHtml = Object.entries(breakdown)
          .sort((a, b) => b[1] - a[1])
          .map(([tag, count]) => `<span style="background:#1a1a2e;border:1px solid #0f3460;border-radius:4px;padding:2px 8px;font-size:11px;">${tag} <strong>${count}</strong></span>`)
          .join(' ')

        root.innerHTML = `
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
            <span style="font-size:12px;color:#8a8a9a;">Show tab order overlay</span>
            <button id="devlens-tab-toggle" style="
              padding:4px 14px;border:none;border-radius:4px;cursor:pointer;
              font-family:var(--dl-font);font-size:12px;font-weight:600;
              background:${active ? '#3a1a1a' : '#1a3a1a'};
              color:${active ? '#e94560' : '#4caf50'};
              border:1px solid ${active ? '#e94560' : '#4caf50'};
            ">${active ? 'Stop' : 'Start'}</button>
          </div>

          <div style="padding:8px 10px;background:#16213e;border-radius:4px;margin-bottom:10px;font-size:12px;">
            <strong style="color:#e0e0e0">${elements.length}</strong> <span style="color:#8a8a9a;">focusable elements found</span>
          </div>

          ${breakdownHtml ? `<div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:10px;">${breakdownHtml}</div>` : ''}

          <div style="font-size:11px;color:#8a8a9a;line-height:1.5;">
            Numbers show the tab navigation order. Purple borders highlight each focusable element.
          </div>
        `

        root.querySelector('#devlens-tab-toggle')?.addEventListener('click', () => {
          if (active) stop()
          else start()
          render()
        })
      }

      render()
    },

    onUnmount() {},
  }
}
