/**
 * A11y Audit plugin — scans the DOM for common accessibility violations
 * (missing lang, heading skips, unlabeled inputs, empty links/buttons,
 * duplicate ids, autoplaying media…) and draws overlays on offenders.
 * Re-scans on DOM mutations and every 3s when the tab is open.
 */
import type { DevLensPlugin } from '../types.js'
import { showToast } from '../toasts.js'

type Severity = 'error' | 'warn'

interface AuditIssue {
  severity: Severity
  category: string
  message: string
  element?: string
  targets?: Element[]
  count: number
}

const SEVERITY_STYLES: Record<Severity, { bg: string; border: string; icon: string }> = {
  error: { bg: '#3a1a1a', border: '#e94560', icon: '🔴' },
  warn: { bg: '#3a2e1a', border: '#f0a030', icon: '🟡' },
}

const HIGHLIGHT_COLORS: Record<Severity, { border: string; bg: string }> = {
  error: { border: 'rgba(233, 69, 96, 0.8)', bg: 'rgba(233, 69, 96, 0.1)' },
  warn: { border: 'rgba(240, 160, 48, 0.7)', bg: 'rgba(240, 160, 48, 0.08)' },
}

function preview(el: Element): string {
  const tag = el.tagName.toLowerCase()
  const id = el.id ? ` id="${el.id}"` : ''
  const cls = el.className && typeof el.className === 'string'
    ? ` class="${el.className.split(' ').slice(0, 2).join(' ')}"`
    : ''
  return `&lt;${tag}${id}${cls}&gt;`
}

// Returns the first element in the list that is actually laid out on
// the page (has a non-zero bounding rect). Falls back to the first
// element in document order if none is visible — better than returning
// nothing when the audit needs a target to scroll to.
function firstVisible<T extends Element>(elements: ArrayLike<T>): T | undefined {
  for (let i = 0; i < elements.length; i++) {
    const el = elements[i]
    const rect = (el as unknown as HTMLElement).getBoundingClientRect()
    if (rect.width > 0 || rect.height > 0) return el
  }
  return elements[0]
}

function hasAccessibleName(el: Element): boolean {
  if (el.getAttribute('aria-label')) return true
  if (el.getAttribute('aria-labelledby')) return true
  if (el.getAttribute('title')) return true
  const text = (el.textContent || '').trim()
  if (text.length > 0) return true
  const img = el.querySelector('img[alt]')
  if (img && img.getAttribute('alt')) return true
  const svg = el.querySelector('svg[aria-label]')
  if (svg) return true
  return false
}

function runAudit(): AuditIssue[] {
  const issues: AuditIssue[] = []

  function add(severity: Severity, category: string, message: string, element?: string, target?: Element | Element[]) {
    const targets = Array.isArray(target) ? target : target ? [target] : undefined
    const existing = issues.find((i) => i.message === message && i.element === element)
    if (existing) {
      existing.count++
      if (targets && targets.length) {
        existing.targets = [...(existing.targets || []), ...targets]
      }
    } else {
      issues.push({ severity, category, message, element, targets, count: 1 })
    }
  }

  const html = document.documentElement
  if (!html.getAttribute('lang')) {
    add('error', 'Structure', 'Missing lang attribute on &lt;html&gt;', undefined, html)
  }

  if (!document.querySelector('main, [role="main"]')) {
    add('warn', 'Structure', 'No &lt;main&gt; landmark found')
  }

  const headings = document.querySelectorAll('h1, h2, h3, h4, h5, h6')
  let prevLevel = 0
  for (const h of headings) {
    const level = parseInt(h.tagName[1])
    if (prevLevel > 0 && level > prevLevel + 1) {
      add('warn', 'Structure', `Heading skip: h${prevLevel} → h${level}`, preview(h), h)
    }
    prevLevel = level
  }

  const h1s = document.querySelectorAll<HTMLHeadingElement>('h1')
  if (h1s.length > 1) {
    // Fixed message (no count) so the dedup key stays stable even when
    // the page's h1 count keeps changing — e.g. an infinite slider that
    // swaps clones in and out would otherwise spam a new toast per tick.
    // Every h1 is passed as a target so renderHighlights marks them all.
    add('warn', 'Structure', 'Multiple &lt;h1&gt; elements — should be unique', undefined, [...h1s])
  }

  const images = document.querySelectorAll('img:not([alt])')
  for (const img of images) {
    if ((img as HTMLElement).closest('#devlens')) continue
    add('error', 'Images', 'Image missing alt attribute', preview(img), img)
  }

  const inputs = document.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
    'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]), select, textarea',
  )
  for (const input of inputs) {
    if (input.closest('#devlens')) continue
    const hasLabel =
      input.getAttribute('aria-label') ||
      input.getAttribute('aria-labelledby') ||
      input.getAttribute('title') ||
      ('placeholder' in input && input.placeholder) ||
      (input.id && document.querySelector(`label[for="${input.id}"]`)) ||
      input.closest('label')
    if (!hasLabel) {
      add('error', 'Forms', 'Input missing label', preview(input), input)
    }
  }

  const links = document.querySelectorAll('a[href]')
  for (const link of links) {
    if ((link as HTMLElement).closest('#devlens')) continue
    if (!hasAccessibleName(link)) {
      add('error', 'Links', 'Empty link — no accessible name', preview(link), link)
    }
  }

  const buttons = document.querySelectorAll('button, [role="button"]')
  for (const btn of buttons) {
    if ((btn as HTMLElement).closest('#devlens')) continue
    if (!hasAccessibleName(btn)) {
      add('error', 'Buttons', 'Empty button — no accessible name', preview(btn), btn)
    }
  }

  const tabindexEls = document.querySelectorAll('[tabindex]')
  for (const el of tabindexEls) {
    if ((el as HTMLElement).closest('#devlens')) continue
    const val = parseInt(el.getAttribute('tabindex') || '0')
    if (val > 0) {
      add('warn', 'Tab Order', `tabindex="${val}" disrupts natural tab order`, preview(el), el)
    }
  }

  const allIds = document.querySelectorAll('[id]')
  const idMap = new Map<string, Element[]>()
  for (const el of allIds) {
    if ((el as HTMLElement).closest('#devlens')) continue
    const id = el.id
    if (!id) continue
    const list = idMap.get(id) || []
    list.push(el)
    idMap.set(id, list)
  }
  for (const [id, list] of idMap) {
    if (list.length > 1) {
      // Fixed message (no count) keeps the dedup stable across scans
      // where the duplicate count fluctuates. All duplicates are passed
      // as targets so every offending element gets its own highlight.
      add('warn', 'IDs', `Duplicate id="${id}" — breaks label/aria associations`, undefined, list)
    }
  }

  const media = document.querySelectorAll('video[autoplay], audio[autoplay]')
  for (const el of media) {
    if ((el as HTMLElement).closest('#devlens')) continue
    if (!el.hasAttribute('controls')) {
      add('warn', 'Media', `Autoplaying ${el.tagName.toLowerCase()} without controls`, preview(el), el)
    }
    if (!el.hasAttribute('muted')) {
      add('warn', 'Media', `Autoplaying ${el.tagName.toLowerCase()} not muted`, preview(el), el)
    }
  }

  return issues
}

interface HighlightEntry {
  box: HTMLElement
  badge: HTMLElement
  target: Element
  // Offsets from the current target rect, captured at creation time.
  // On scroll we only re-read the rect and apply these deltas — no DOM
  // churn and no overlap re-computation.
  badgeLeftDelta: number
  badgeTopDelta: number
}

export function a11yAuditPlugin(): DevLensPlugin {
  let observer: MutationObserver | null = null
  let highlightEntries: HighlightEntry[] = []
  let lastIssueKeys = new Set<string>()
  let scanTimeout: ReturnType<typeof setTimeout> | null = null
  let showHighlights = true
  let viewportTicking = false
  let viewportListenersAttached = false

  function issueKey(i: AuditIssue): string {
    return `${i.severity}:${i.category}:${i.message}:${i.element || ''}`
  }

  function clearHighlights() {
    for (const entry of highlightEntries) {
      entry.box.remove()
      entry.badge.remove()
    }
    highlightEntries = []
  }

  function updateHighlightPositions() {
    // Read scroll once per frame (cheap, but avoid N reads in the loop).
    const sx = window.scrollX
    const sy = window.scrollY
    for (const entry of highlightEntries) {
      if (!document.body.contains(entry.target)) {
        entry.box.style.display = 'none'
        entry.badge.style.display = 'none'
        continue
      }
      const rect = (entry.target as HTMLElement).getBoundingClientRect()
      if (rect.width === 0 && rect.height === 0) {
        entry.box.style.display = 'none'
        entry.badge.style.display = 'none'
        continue
      }
      entry.box.style.display = ''
      entry.badge.style.display = ''
      entry.box.style.left = `${rect.left + sx}px`
      entry.box.style.top = `${rect.top + sy}px`
      entry.box.style.width = `${rect.width}px`
      entry.box.style.height = `${rect.height}px`
      entry.badge.style.left = `${rect.left + sx + entry.badgeLeftDelta}px`
      entry.badge.style.top = `${rect.top + sy + entry.badgeTopDelta}px`
    }
  }

  function onViewportChange() {
    if (viewportTicking) return
    viewportTicking = true
    requestAnimationFrame(() => {
      updateHighlightPositions()
      viewportTicking = false
    })
  }

  function attachViewportListeners() {
    if (viewportListenersAttached) return
    viewportListenersAttached = true
    // capture: true so we catch scrolls from nested scroll containers too.
    window.addEventListener('scroll', onViewportChange, { passive: true, capture: true })
    window.addEventListener('resize', onViewportChange, { passive: true })
  }

  // Scrolls the target into view and draws a short-lived bright outline
  // on top of it. Invoked when the user clicks an issue row in the panel.
  // Uses position:absolute + document coordinates so the flash stays
  // locked to the target during the smooth-scroll animation.
  function flashIssueTarget(el: Element) {
    if (!document.body.contains(el)) return
    ;(el as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'center' })
    const rect = (el as HTMLElement).getBoundingClientRect()
    if (rect.width === 0 && rect.height === 0) return
    const flash = document.createElement('div')
    flash.setAttribute('data-devlens', '')
    flash.style.cssText = `
      position:absolute;z-index:999997;pointer-events:none;
      border:3px solid #4ea8de;border-radius:4px;
      background:rgba(78, 168, 222, 0.15);
      box-shadow:0 0 24px rgba(78, 168, 222, 0.55);
      left:${rect.left + window.scrollX}px;top:${rect.top + window.scrollY}px;
      width:${rect.width}px;height:${rect.height}px;
      transition:opacity 0.6s ease;
    `
    document.body.append(flash)
    setTimeout(() => {
      flash.style.opacity = '0'
      setTimeout(() => flash.remove(), 600)
    }, 900)
  }

  function renderHighlights(issues: AuditIssue[]) {
    clearHighlights()
    if (!showHighlights) return

    // Group issues by target element. A single issue can carry several
    // targets (e.g. every duplicate h1), so we iterate targets[].
    const grouped = new Map<Element, AuditIssue[]>()
    for (const issue of issues) {
      if (!issue.targets) continue
      for (const target of issue.targets) {
        if (!document.body.contains(target)) continue
        if ((target as HTMLElement).closest('#devlens')) continue
        const list = grouped.get(target) || []
        list.push(issue)
        grouped.set(target, list)
      }
    }

    for (const [el, elIssues] of grouped) {
      const rect = (el as HTMLElement).getBoundingClientRect()
      if (rect.width === 0 && rect.height === 0) continue

      const worstSeverity = elIssues.some((i) => i.severity === 'error') ? 'error' : 'warn'
      const colors = HIGHLIGHT_COLORS[worstSeverity]

      // position:absolute + document coordinates so the browser scrolls
      // overlays natively with the page — no per-frame JS work, no lag.
      const sx = window.scrollX
      const sy = window.scrollY

      const highlight = document.createElement('div')
      highlight.setAttribute('data-devlens', '')
      highlight.style.cssText = `
        position:absolute;z-index:999995;pointer-events:none;
        border:2px solid ${colors.border};border-radius:4px;
        background:${colors.bg};
        left:${rect.left + sx}px;top:${rect.top + sy}px;
        width:${rect.width}px;height:${rect.height}px;
      `

      const badge = document.createElement('span')
      const lines = elIssues.map((i) => i.message.replace(/&lt;/g, '<').replace(/&gt;/g, '>')).join('\n')
      badge.style.cssText = `
        position:absolute;
        background:${colors.border};color:#fff;
        font-family:ui-monospace,monospace;font-size:9px;font-weight:700;
        padding:2px 6px;border-radius:3px;
        white-space:pre-line;max-width:220px;
        box-shadow:0 1px 4px rgba(0,0,0,0.3);
        line-height:1.4;
      `
      badge.textContent = lines

      // Place the badge above the element's top-left corner. If there
      // isn't enough room above, tuck it just inside the top-left instead.
      const badgeLineCount = elIssues.length
      const badgeHeight = 14 + badgeLineCount * 13
      const gap = 4
      let badgeTop = rect.top - badgeHeight - gap
      if (badgeTop < gap) badgeTop = rect.top + gap
      const badgeLeft = rect.left
      badge.style.left = `${badgeLeft + sx}px`
      badge.style.top = `${badgeTop + sy}px`

      document.body.append(highlight)
      document.body.append(badge)
      badge.setAttribute('data-devlens', '')

      highlightEntries.push({
        box: highlight,
        badge,
        target: el,
        badgeLeftDelta: badgeLeft - rect.left,
        badgeTopDelta: badgeTop - rect.top,
      })
    }

    attachViewportListeners()
  }

  function scan() {
    const issues = runAudit()
    const newKeys = new Set(issues.map(issueKey))

    // Toast new issues only
    for (const issue of issues) {
      const key = issueKey(issue)
      if (!lastIssueKeys.has(key)) {
        const level = issue.severity === 'error' ? 'error' : 'warn'
        const prefix = `A11y [${issue.category}]`
        showToast({ level, message: `${prefix}: ${issue.message.replace(/&lt;/g, '<').replace(/&gt;/g, '>')}` })
      }
    }

    lastIssueKeys = newKeys
    renderHighlights(issues)
    return issues
  }

  function debouncedScan() {
    if (scanTimeout) clearTimeout(scanTimeout)
    scanTimeout = setTimeout(() => scan(), 500)
  }

  function startObserver() {
    if (observer) return
    observer = new MutationObserver((mutations) => {
      const allDevlens = mutations.every((m) => {
        const t = m.target instanceof Element ? m.target : m.target.parentElement
        if (t?.closest('#devlens') || t?.closest('[data-devlens]')) return true
        const nodes = [...m.addedNodes, ...m.removedNodes]
        return nodes.length > 0 && nodes.every((n) =>
          n instanceof Element && (n.hasAttribute('data-devlens') || n.closest?.('[data-devlens]') || n.closest?.('#devlens')),
        )
      })
      if (!allDevlens) debouncedScan()
    })
    observer.observe(document.body, { childList: true, subtree: true, attributes: true })
  }

  // Auto-start
  startObserver()
  scan()

  return {
    name: 'A11y Audit',
    icon: '♿',

    panel() {
      const el = document.createElement('div')
      el.className = 'devlens-a11y-audit'
      return el
    },

    onMount(container) {
      const root = container.querySelector('.devlens-a11y-audit') as HTMLElement

      const render = () => {
        const issues = runAudit()
        renderHighlights(issues)
        const errors = issues.filter((i) => i.severity === 'error')
        const warnings = issues.filter((i) => i.severity === 'warn')

        const categories = [...new Set(issues.map((i) => i.category))]

        // Flat index → issue, populated in render order so click
        // handlers can look up the right issue by data-issue-idx.
        const orderedIssues: AuditIssue[] = []

        const issueRows = issues.length === 0
          ? `<div style="padding:8px 10px;background:#1a3a1a;border-radius:4px;border-left:3px solid #4caf50;font-size:12px;color:#8a8a9a;">
              No accessibility issues detected!
            </div>`
          : categories.map((cat) => {
              const catIssues = issues.filter((i) => i.category === cat)
              return `
                <div style="margin-bottom:10px;">
                  <div style="font-size:11px;color:#8a8a9a;margin-bottom:4px;text-transform:uppercase;letter-spacing:0.5px;">${cat}</div>
                  ${catIssues.map((issue) => {
                    const idx = orderedIssues.length
                    orderedIssues.push(issue)
                    const style = SEVERITY_STYLES[issue.severity]
                    const countBadge = issue.count > 1 ? `<span style="background:${style.border};color:#fff;border-radius:3px;padding:0 5px;font-size:10px;font-weight:600;">×${issue.count}</span>` : ''
                    const hasTarget = !!(issue.targets && issue.targets.length > 0)
                    const clickable = hasTarget ? 'cursor:pointer;' : ''
                    const hint = hasTarget ? ` title="Click to locate on page"` : ''
                    return `
                      <div data-issue-idx="${idx}"${hint} style="padding:6px 8px;background:${style.bg};border-left:3px solid ${style.border};border-radius:4px;margin-bottom:3px;font-size:12px;${clickable}">
                        <div style="display:flex;align-items:start;justify-content:space-between;gap:6px;">
                          <span>${style.icon} ${issue.message}</span>
                          ${countBadge}
                        </div>
                        ${issue.element ? `<code style="display:block;margin-top:3px;font-size:10px;color:#8a8a9a;">${issue.element}</code>` : ''}
                      </div>
                    `
                  }).join('')}
                </div>
              `
            }).join('')

        root.innerHTML = `
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
            <span style="font-size:12px;color:#8a8a9a;">Auto-scans on DOM changes</span>
            <div style="display:flex;gap:6px;">
              <button id="devlens-a11y-highlight" style="
                padding:4px 10px;border:1px solid #0f3460;border-radius:4px;cursor:pointer;
                font-family:var(--dl-font);font-size:11px;background:transparent;
                color:${showHighlights ? '#4caf50' : '#8a8a9a'};
              ">${showHighlights ? 'Hide overlays' : 'Show overlays'}</button>
              <button id="devlens-a11y-rescan" style="
                padding:4px 10px;border:1px solid #0f3460;border-radius:4px;cursor:pointer;
                font-family:var(--dl-font);font-size:11px;background:transparent;color:#8a8a9a;
              ">Re-scan</button>
            </div>
          </div>

          <div style="display:flex;gap:12px;margin-bottom:12px;font-size:12px;">
            <span style="color:${errors.length > 0 ? '#e94560' : '#4caf50'};">🔴 <strong>${errors.length}</strong> error${errors.length !== 1 ? 's' : ''}</span>
            <span style="color:${warnings.length > 0 ? '#f0a030' : '#4caf50'};">🟡 <strong>${warnings.length}</strong> warning${warnings.length !== 1 ? 's' : ''}</span>
          </div>

          ${issueRows}
        `

        root.querySelector('#devlens-a11y-rescan')?.addEventListener('click', render)
        root.querySelector('#devlens-a11y-highlight')?.addEventListener('click', () => {
          showHighlights = !showHighlights
          if (!showHighlights) clearHighlights()
          render()
        })

        root.querySelectorAll<HTMLElement>('[data-issue-idx]').forEach((row) => {
          const idx = Number(row.getAttribute('data-issue-idx'))
          const issue = orderedIssues[idx]
          if (!issue || !issue.targets || issue.targets.length === 0) return
          row.addEventListener('click', () => {
            const target = firstVisible(issue.targets!) || issue.targets![0]
            if (target) flashIssueTarget(target)
          })
        })
      }

      render()
      const intervalId = setInterval(render, 3000)
      root.setAttribute('data-interval', String(intervalId))
    },

    onUnmount() {},
  }
}
