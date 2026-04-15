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
  'button',
  'input:not([type="hidden"])',
  'select',
  'textarea',
  '[tabindex]',
  'summary',
  '[contenteditable="true"]',
  '[contenteditable=""]',
  '[role="button"]',
  '[role="link"]',
  '[role="tab"]',
  '[role="menuitem"]',
  'audio[controls]',
  'video[controls]',
  'iframe',
].join(',')

// Returns true only if the element is actually reachable by keyboard tab.
// Handles disabled, aria-disabled, inert, tabindex=-1, hidden ancestors
// and disabled fieldsets — all cases CSS selectors alone can't cover.
function isTabbable(el: HTMLElement): boolean {
  // tabindex="-1" removes the element from the sequential tab order
  const tabindexAttr = el.getAttribute('tabindex')
  if (tabindexAttr !== null && parseInt(tabindexAttr, 10) < 0) return false

  // Native disabled on form controls
  if ('disabled' in el && (el as HTMLInputElement | HTMLButtonElement | HTMLSelectElement | HTMLTextAreaElement).disabled) return false

  // A disabled <fieldset> disables its descendants (except the first legend)
  const disabledFieldset = el.closest('fieldset[disabled]')
  if (disabledFieldset) {
    const firstLegend = disabledFieldset.querySelector(':scope > legend:first-of-type')
    if (!firstLegend || !firstLegend.contains(el)) return false
  }

  // ARIA disabled
  if (el.getAttribute('aria-disabled') === 'true') return false

  // aria-hidden removes the element from the accessibility tree — still
  // technically focusable, but a11y-wise we want to flag it as unreachable.
  if (el.closest('[aria-hidden="true"]')) return false

  // HTML5 inert attribute (on the element or any ancestor)
  if (el.closest('[inert]')) return false

  // Visibility
  const style = getComputedStyle(el)
  if (style.display === 'none') return false
  if (style.visibility === 'hidden' || style.visibility === 'collapse') return false

  // offsetParent is null when the element (or an ancestor) is display:none
  // — except for position:fixed elements which keep their own layout.
  if (el.offsetParent === null && style.position !== 'fixed') return false

  return true
}

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

interface TabBadgeEntry {
  badge: HTMLElement
  target: HTMLElement
}

export function a11yTabOrderPlugin(): DevLensPlugin {
  let active = loadActive()
  let badgeEntries: TabBadgeEntry[] = []
  let observer: MutationObserver | null = null
  let rerenderTimeout: ReturnType<typeof setTimeout> | null = null
  let viewportTicking = false
  let viewportListenersAttached = false

  function getFocusableElements(): HTMLElement[] {
    return [...document.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)]
      .filter((el) => !el.closest('#devlens') && isTabbable(el))
  }

  function clearBadges() {
    for (const entry of badgeEntries) entry.badge.remove()
    badgeEntries = []
  }

  function renderBadges() {
    clearBadges()
    if (!active) return

    const elements = getFocusableElements()
    const sx = window.scrollX
    const sy = window.scrollY

    for (let i = 0; i < elements.length; i++) {
      const el = elements[i]
      const rect = el.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) continue

      const badge = document.createElement('div')
      badge.className = OVERLAY_CLASS
      badge.setAttribute('data-devlens', '')
      badge.style.left = `${rect.left + sx}px`
      badge.style.top = `${rect.top + sy}px`
      badge.style.width = `${rect.width}px`
      badge.style.height = `${rect.height}px`

      const num = document.createElement('span')
      num.className = `${OVERLAY_CLASS}__num`
      num.textContent = String(i + 1)
      badge.append(num)

      document.body.append(badge)
      badgeEntries.push({ badge, target: el })
    }
  }

  function updateBadgePositions() {
    if (!active) return
    const sx = window.scrollX
    const sy = window.scrollY
    for (const entry of badgeEntries) {
      if (!document.body.contains(entry.target)) {
        entry.badge.style.display = 'none'
        continue
      }
      const rect = entry.target.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) {
        entry.badge.style.display = 'none'
        continue
      }
      entry.badge.style.display = ''
      entry.badge.style.left = `${rect.left + sx}px`
      entry.badge.style.top = `${rect.top + sy}px`
      entry.badge.style.width = `${rect.width}px`
      entry.badge.style.height = `${rect.height}px`
    }
  }

  function onViewportChange() {
    if (viewportTicking) return
    viewportTicking = true
    requestAnimationFrame(() => {
      updateBadgePositions()
      viewportTicking = false
    })
  }

  function attachViewportListeners() {
    if (viewportListenersAttached) return
    viewportListenersAttached = true
    window.addEventListener('scroll', onViewportChange, { passive: true, capture: true })
    window.addEventListener('resize', onViewportChange, { passive: true })
  }

  function detachViewportListeners() {
    if (!viewportListenersAttached) return
    viewportListenersAttached = false
    window.removeEventListener('scroll', onViewportChange, { capture: true } as EventListenerOptions)
    window.removeEventListener('resize', onViewportChange)
  }

  function debouncedRerender() {
    if (rerenderTimeout) clearTimeout(rerenderTimeout)
    rerenderTimeout = setTimeout(() => {
      rerenderTimeout = null
      renderBadges()
    }, 150)
  }

  function startObserver() {
    if (observer) return
    observer = new MutationObserver((mutations) => {
      // Ignore mutations that are entirely devlens-internal to avoid
      // feedback loops (renderBadges adds/removes its own badges).
      const anyExternal = mutations.some((m) => {
        const t = m.target instanceof Element ? m.target : m.target.parentElement
        if (t?.closest('#devlens') || t?.closest('[data-devlens]')) return false
        const nodes = [...m.addedNodes, ...m.removedNodes]
        if (nodes.length > 0 && nodes.every((n) =>
          n instanceof Element && (n.hasAttribute('data-devlens') || n.closest?.('[data-devlens]') || n.closest?.('#devlens')),
        )) return false
        return true
      })
      if (anyExternal) debouncedRerender()
    })
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['disabled', 'hidden', 'aria-hidden', 'tabindex', 'role', 'style', 'class'],
    })
  }

  function stopObserver() {
    observer?.disconnect()
    observer = null
    if (rerenderTimeout) clearTimeout(rerenderTimeout)
    rerenderTimeout = null
  }

  function start() {
    if (active) return
    active = true
    saveActive(true)
    injectBadgeStyles()
    renderBadges()
    attachViewportListeners()
    startObserver()
  }

  function stop() {
    if (!active) return
    active = false
    saveActive(false)
    clearBadges()
    detachViewportListeners()
    stopObserver()
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
