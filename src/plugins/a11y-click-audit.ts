/**
 * Click Audit plugin — monkey-patches `addEventListener` to remember
 * which elements have click-ish handlers, then watches real clicks. Any
 * click that lands on a non-semantic element (div/span/img) with a
 * handler is flagged as a keyboard-accessibility trap.
 */
import type { DevLensPlugin } from '../types'
import { showToast } from '../toasts'

const STORAGE_KEY = 'devlens:a11y-click'

interface A11yIssue {
  element: string
  selector: string
  reason: string
  count: number
  timestamp: number
}

const INTERACTIVE_TAGS = new Set([
  'a', 'button', 'input', 'select', 'textarea', 'summary', 'details', 'label', 'option',
])

const INTERACTIVE_ROLES = new Set([
  'button', 'link', 'tab', 'menuitem', 'menuitemcheckbox', 'menuitemradio',
  'option', 'switch', 'checkbox', 'radio', 'combobox', 'listbox',
  'slider', 'spinbutton', 'textbox', 'searchbox', 'treeitem',
])

// Track elements that have click-like listeners attached via addEventListener
const elementsWithListeners = new WeakSet<EventTarget>()
const CLICK_EVENTS = new Set(['click', 'mousedown', 'mouseup', 'pointerdown', 'pointerup'])

const origAddEventListener = EventTarget.prototype.addEventListener
EventTarget.prototype.addEventListener = function (type: string, listener: EventListenerOrEventListenerObject | null, options?: boolean | AddEventListenerOptions) {
  if (CLICK_EVENTS.has(type)) elementsWithListeners.add(this)
  return origAddEventListener.call(this, type, listener, options)
}

function hasClickBehavior(el: HTMLElement): boolean {
  // 1. Tracked via addEventListener monkey-patch
  if (elementsWithListeners.has(el)) return true

  // 2. Inline handler
  if (el.onclick || el.onmousedown || el.onpointerdown) return true

  // 3. cursor: pointer = dev intended it to be clickable
  if (getComputedStyle(el).cursor === 'pointer') return true

  return false
}

function loadActive(): boolean {
  try { return localStorage.getItem(STORAGE_KEY) === '1' } catch { return false }
}

function saveActive(v: boolean) {
  try { localStorage.setItem(STORAGE_KEY, v ? '1' : '0') } catch {}
}

function isInteractiveElement(el: HTMLElement): boolean {
  if (INTERACTIVE_TAGS.has(el.tagName.toLowerCase())) return true
  const role = el.getAttribute('role')
  if (role && INTERACTIVE_ROLES.has(role)) return true
  if (el.hasAttribute('tabindex') && el.getAttribute('tabindex') !== '-1') return true
  if (el.getAttribute('contenteditable') === 'true') return true
  return false
}

function getSelector(el: HTMLElement): string {
  const tag = el.tagName.toLowerCase()
  const id = el.id ? `#${el.id}` : ''
  const classes = [...el.classList].slice(0, 2).map((c) => `.${c}`).join('')
  return `${tag}${id}${classes}`
}

function getElementPreview(el: HTMLElement): string {
  const tag = el.tagName.toLowerCase()
  const text = (el.textContent || '').trim().slice(0, 40)
  const attrs: string[] = []
  if (el.id) attrs.push(`id="${el.id}"`)
  if (el.className) attrs.push(`class="${[...el.classList].slice(0, 2).join(' ')}"`)
  const attrStr = attrs.length ? ' ' + attrs.join(' ') : ''
  const inner = text ? `${text.length > 30 ? text.slice(0, 30) + '…' : text}` : ''
  return `<${tag}${attrStr}>${inner}</${tag}>`
}

function diagnose(el: HTMLElement): string {
  const tag = el.tagName.toLowerCase()
  if (tag === 'div' || tag === 'span') {
    if (!el.getAttribute('role')) return `<${tag}> used as interactive but missing role="button" or similar`
    return `Has role but missing tabindex for keyboard access`
  }
  if (tag === 'img') return `<img> with click handler — wrap in <button> or add role="button" + tabindex`
  if (tag === 'li') return `<li> with click handler — use <button> inside or add role + tabindex`
  return `Non-interactive <${tag}> receives clicks — add role + tabindex or use a semantic element`
}

export function a11yClickAuditPlugin(): DevLensPlugin {
  let active = loadActive()
  const issues: A11yIssue[] = []
  let clickHandler: ((e: MouseEvent) => void) | null = null
  const flashElements: Map<HTMLElement, HTMLElement> = new Map()

  function flashElement(el: HTMLElement) {
    if (el.closest('#devlens')) return

    const existing = flashElements.get(el)
    if (existing) existing.remove()

    const rect = el.getBoundingClientRect()
    const flash = document.createElement('div')
    flash.setAttribute('data-devlens', '')
    flash.style.cssText = `
      position:fixed;z-index:999996;pointer-events:none;
      border:2px dashed #e94560;border-radius:4px;
      background:rgba(233,69,96,0.12);
      left:${rect.left}px;top:${rect.top}px;
      width:${rect.width}px;height:${rect.height}px;
      transition:opacity 2s ease;
    `
    document.body.append(flash)
    flashElements.set(el, flash)

    setTimeout(() => {
      flash.style.opacity = '0'
      setTimeout(() => { flash.remove(); flashElements.delete(el) }, 2000)
    }, 1500)
  }

  function handleClick(e: MouseEvent) {
    if (!active) return

    const target = e.target as HTMLElement
    if (!target || target.closest('#devlens') || target.closest('[data-devlens]')) return

    // Walk up to find the actual "clicked" element (max 3 levels)
    let el: HTMLElement | null = target
    let found = false
    for (let i = 0; i < 4 && el; i++) {
      if (isInteractiveElement(el)) { found = true; break }
      el = el.parentElement
    }

    if (found || !target) return

    // Check if the element (or close ancestor) actually has click behavior
    let hasHandler = false
    let check: HTMLElement | null = target
    for (let i = 0; i < 4 && check; i++) {
      if (hasClickBehavior(check)) { hasHandler = true; break }
      check = check.parentElement
    }
    if (!hasHandler) return

    // This click landed on a non-interactive element that HAS a handler
    const selector = getSelector(target)
    const existing = issues.find((i) => i.selector === selector)
    if (existing) {
      existing.count++
      existing.timestamp = Date.now()
      showToast({ level: 'warn', message: `A11y: ${existing.reason}`, count: existing.count })
    } else {
      const issue: A11yIssue = {
        element: getElementPreview(target),
        selector,
        reason: diagnose(target),
        count: 1,
        timestamp: Date.now(),
      }
      issues.unshift(issue)
      if (issues.length > 30) issues.pop()
      showToast({ level: 'warn', message: `A11y: ${issue.reason}` })
    }

    flashElement(target)
  }

  function start() {
    if (active) return
    active = true
    saveActive(true)
    clickHandler = handleClick
    document.addEventListener('click', clickHandler, true)
  }

  function stop() {
    if (!active) return
    active = false
    saveActive(false)
    if (clickHandler) document.removeEventListener('click', clickHandler, true)
    clickHandler = null
    for (const f of flashElements.values()) f.remove()
    flashElements.clear()
  }

  if (active) {
    active = false
    start()
  }

  return {
    name: 'Click Audit',
    icon: '👆',

    panel() {
      const el = document.createElement('div')
      el.className = 'devlens-click-audit'
      return el
    },

    onMount(container) {
      const root = container.querySelector('.devlens-click-audit') as HTMLElement

      const render = () => {
        const issueRows = issues.length === 0
          ? `<div style="padding:8px 10px;background:#1a3a1a;border-radius:4px;border-left:3px solid #4caf50;font-size:12px;color:#8a8a9a;">
              ${active ? 'Listening… click around the page to detect issues.' : 'No issues captured yet.'}
            </div>`
          : issues.map((issue) => {
              const countBadge = issue.count > 1 ? `<span style="background:#e94560;color:#fff;border-radius:3px;padding:0 5px;font-size:10px;font-weight:600;">x${issue.count}</span>` : ''
              return `
                <div style="padding:8px 10px;background:#3a1a1a;border-left:3px solid #e94560;border-radius:4px;margin-bottom:6px;">
                  <div style="display:flex;align-items:start;justify-content:space-between;gap:8px;margin-bottom:4px;">
                    <code style="font-size:11px;color:#e94560;word-break:break-all;">${issue.element}</code>
                    ${countBadge}
                  </div>
                  <div style="font-size:11px;color:#8a8a9a;line-height:1.4;">${issue.reason}</div>
                </div>
              `
            }).join('')

        root.innerHTML = `
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
            <span style="font-size:12px;color:#8a8a9a;">Detect clicks on non-accessible elements</span>
            <div style="display:flex;gap:6px;">
              ${issues.length > 0 ? `<button id="devlens-click-clear" style="
                padding:4px 10px;border:1px solid #0f3460;border-radius:4px;cursor:pointer;
                font-family:var(--dl-font);font-size:11px;background:transparent;color:#8a8a9a;
              ">Clear</button>` : ''}
              <button id="devlens-click-toggle" style="
                padding:4px 14px;border:none;border-radius:4px;cursor:pointer;
                font-family:var(--dl-font);font-size:12px;font-weight:600;
                background:${active ? '#3a1a1a' : '#1a3a1a'};
                color:${active ? '#e94560' : '#4caf50'};
                border:1px solid ${active ? '#e94560' : '#4caf50'};
              ">${active ? 'Stop' : 'Start'}</button>
            </div>
          </div>

          ${issues.length > 0 ? `
            <div style="padding:6px 10px;background:#16213e;border-radius:4px;margin-bottom:10px;font-size:12px;">
              🔴 <strong style="color:#e0e0e0">${issues.length}</strong> <span style="color:#8a8a9a;">non-accessible element(s) clicked</span>
            </div>
          ` : ''}

          <div style="margin-bottom:8px;">${issueRows}</div>

          <div style="font-size:11px;color:#8a8a9a;line-height:1.5;border-top:1px solid #0f3460;padding-top:8px;">
            Clicks on non-interactive elements (div, span, img…) without proper <code>role</code> or <code>tabindex</code> are flagged. Dashed red borders flash on the page.
          </div>
        `

        root.querySelector('#devlens-click-toggle')?.addEventListener('click', () => {
          if (active) stop()
          else start()
          render()
        })

        root.querySelector('#devlens-click-clear')?.addEventListener('click', () => {
          issues.length = 0
          render()
        })
      }

      render()
      const intervalId = setInterval(render, 2000)
      root.setAttribute('data-interval', String(intervalId))
    },

    onUnmount() {},
  }
}
