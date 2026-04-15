/**
 * A11y Audit plugin — scans the DOM for common accessibility violations
 * (missing lang, heading skips, unlabeled inputs, empty links/buttons,
 * duplicate ids, autoplaying media…) and draws overlays on offenders.
 * Re-scans on DOM mutations and every 3s when the tab is open.
 */
import type { DevLensPlugin } from '../types'
import { showToast } from '../toasts'

type Severity = 'error' | 'warn'

interface AuditIssue {
  severity: Severity
  category: string
  message: string
  element?: string
  target?: Element
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

  function add(severity: Severity, category: string, message: string, element?: string, target?: Element) {
    const existing = issues.find((i) => i.message === message && i.element === element)
    if (existing) {
      existing.count++
    } else {
      issues.push({ severity, category, message, element, target, count: 1 })
    }
  }

  const html = document.documentElement
  if (!html.getAttribute('lang')) {
    add('error', 'Structure', 'Missing lang attribute on &lt;html&gt;')
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

  const h1s = document.querySelectorAll('h1')
  if (h1s.length > 1) {
    add('warn', 'Structure', `${h1s.length} &lt;h1&gt; elements found — should be unique`)
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
  const idMap = new Map<string, number>()
  for (const el of allIds) {
    if ((el as HTMLElement).closest('#devlens')) continue
    const id = el.id
    if (id) idMap.set(id, (idMap.get(id) || 0) + 1)
  }
  for (const [id, count] of idMap) {
    if (count > 1) {
      add('warn', 'IDs', `Duplicate id="${id}" (×${count}) — breaks label/aria associations`)
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

export function a11yAuditPlugin(): DevLensPlugin {
  let observer: MutationObserver | null = null
  let highlights: HTMLElement[] = []
  let lastIssueKeys = new Set<string>()
  let scanTimeout: ReturnType<typeof setTimeout> | null = null
  let showHighlights = true

  function issueKey(i: AuditIssue): string {
    return `${i.severity}:${i.category}:${i.message}:${i.element || ''}`
  }

  function clearHighlights() {
    for (const h of highlights) h.remove()
    highlights = []
  }

  function renderHighlights(issues: AuditIssue[]) {
    clearHighlights()
    if (!showHighlights) return

    // Group issues by target element
    const grouped = new Map<Element, AuditIssue[]>()
    for (const issue of issues) {
      if (!issue.target || !document.body.contains(issue.target)) continue
      const el = issue.target as HTMLElement
      if (el.closest('#devlens')) continue
      const list = grouped.get(el) || []
      list.push(issue)
      grouped.set(el, list)
    }

    // Track badge bottom positions to avoid overlaps
    const badgeBottoms: number[] = []

    for (const [el, elIssues] of grouped) {
      const rect = (el as HTMLElement).getBoundingClientRect()
      if (rect.width === 0 && rect.height === 0) continue

      const worstSeverity = elIssues.some((i) => i.severity === 'error') ? 'error' : 'warn'
      const colors = HIGHLIGHT_COLORS[worstSeverity]

      const highlight = document.createElement('div')
      highlight.setAttribute('data-devlens', '')
      highlight.style.cssText = `
        position:fixed;z-index:999995;pointer-events:none;
        border:2px solid ${colors.border};border-radius:4px;
        background:${colors.bg};
        left:${rect.left}px;top:${rect.top}px;
        width:${rect.width}px;height:${rect.height}px;
      `

      const badge = document.createElement('span')
      const lines = elIssues.map((i) => i.message.replace(/&lt;/g, '<').replace(/&gt;/g, '>')).join('\n')
      badge.style.cssText = `
        position:fixed;
        background:${colors.border};color:#fff;
        font-family:ui-monospace,monospace;font-size:9px;font-weight:700;
        padding:2px 6px;border-radius:3px;
        white-space:pre-line;max-width:220px;
        box-shadow:0 1px 4px rgba(0,0,0,0.3);
        line-height:1.4;
      `
      badge.textContent = lines

      // Position badge above the element, push down if overlapping
      let badgeTop = rect.top - 18
      const badgeLineCount = elIssues.length
      const badgeHeight = 14 + badgeLineCount * 13

      for (const prevBottom of badgeBottoms) {
        if (badgeTop < prevBottom && badgeTop + badgeHeight > prevBottom - badgeHeight) {
          badgeTop = prevBottom + 4
        }
      }

      badge.style.left = `${rect.right - 4}px`
      badge.style.top = `${badgeTop}px`
      badgeBottoms.push(badgeTop + badgeHeight)

      document.body.append(highlight)
      document.body.append(badge)
      badge.setAttribute('data-devlens', '')
      highlights.push(highlight)
      highlights.push(badge)
    }
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
      let refreshInterval: ReturnType<typeof setInterval> | null = null

      const render = () => {
        const issues = runAudit()
        renderHighlights(issues)
        const errors = issues.filter((i) => i.severity === 'error')
        const warnings = issues.filter((i) => i.severity === 'warn')

        const categories = [...new Set(issues.map((i) => i.category))]

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
                    const style = SEVERITY_STYLES[issue.severity]
                    const countBadge = issue.count > 1 ? `<span style="background:${style.border};color:#fff;border-radius:3px;padding:0 5px;font-size:10px;font-weight:600;">×${issue.count}</span>` : ''
                    return `
                      <div style="padding:6px 8px;background:${style.bg};border-left:3px solid ${style.border};border-radius:4px;margin-bottom:3px;font-size:12px;">
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
      }

      render()
      refreshInterval = setInterval(render, 3000)
      root.setAttribute('data-interval', String(refreshInterval))
    },

    onUnmount() {},
  }
}
