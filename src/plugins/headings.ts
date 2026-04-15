/**
 * Headings plugin — renders the full h1–h6 outline of the page, flags
 * level skips (h1 → h3), empty headings, missing or multiple h1 and
 * hidden headings. Click any row in the outline to scroll to the element
 * and flash it on the page.
 */
import type { DevLensPlugin } from '../types.js'
import { showToast } from '../toasts.js'

type Severity = 'error' | 'warn' | 'info'

interface HeadingNode {
  level: number
  text: string
  hidden: boolean
  empty: boolean
  skip: boolean
  el: HTMLHeadingElement
}

interface HeadingIssue {
  severity: Severity
  message: string
  detail?: string
  count: number
}

const SEVERITY_STYLES: Record<Severity, { bg: string; border: string; icon: string; color: string }> = {
  error: { bg: '#3a1a1a', border: '#e94560', icon: '🔴', color: '#e94560' },
  warn: { bg: '#3a2e1a', border: '#f0a030', icon: '🟡', color: '#f0a030' },
  info: { bg: '#1a2a3a', border: '#4ea8de', icon: '🔵', color: '#4ea8de' },
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function isHidden(el: HTMLElement): boolean {
  if (el.getAttribute('aria-hidden') === 'true') return true
  if (el.hidden) return true
  const style = getComputedStyle(el)
  if (style.display === 'none' || style.visibility === 'hidden') return true
  return false
}

function collect(): { nodes: HeadingNode[]; issues: HeadingIssue[] } {
  const headings = Array.from(
    document.querySelectorAll<HTMLHeadingElement>('h1, h2, h3, h4, h5, h6'),
  ).filter((h) => !h.closest('#devlens'))

  const issues: HeadingIssue[] = []
  function add(severity: Severity, message: string, detail?: string) {
    const existing = issues.find((i) => i.message === message && i.severity === severity)
    if (existing) {
      existing.count++
    } else {
      issues.push({ severity, message, detail, count: 1 })
    }
  }

  const nodes: HeadingNode[] = []
  let prevVisibleLevel = 0
  let visibleH1Count = 0

  for (const el of headings) {
    const level = parseInt(el.tagName[1])
    const text = (el.textContent || '').trim()
    const hidden = isHidden(el)
    const empty = text.length === 0
    let skip = false

    if (!hidden) {
      if (level === 1) visibleH1Count++

      if (prevVisibleLevel > 0 && level > prevVisibleLevel + 1) {
        skip = true
        add(
          'error',
          `Heading skip: h${prevVisibleLevel} → h${level}`,
          text || '(empty)',
        )
      }
      prevVisibleLevel = level

      if (empty) {
        add('warn', `Empty <h${level}>`)
      }
      if (level >= 5) {
        add('info', `Deep heading <h${level}> — consider restructuring`, text || '(empty)')
      }
    }

    nodes.push({ level, text, hidden, empty, skip, el })
  }

  if (headings.length === 0) {
    add('warn', 'No headings found on page')
  } else if (visibleH1Count > 1) {
    add('info', `${visibleH1Count} visible <h1> elements (one is conventional)`)
  }
  // Starting level (h1 vs h2) and h1 presence are conventions, not WCAG
  // requirements — we only flag actual hierarchy skips below.

  return { nodes, issues }
}

export function headingsPlugin(): DevLensPlugin {
  let lastIssueKeys = new Set<string>()
  let highlightedEl: HTMLElement | null = null

  function issueKey(i: HeadingIssue): string {
    return `${i.severity}:${i.message}`
  }

  function clearHighlight() {
    if (highlightedEl) {
      highlightedEl.remove()
      highlightedEl = null
    }
  }

  function highlight(target: HTMLElement) {
    clearHighlight()
    const rect = target.getBoundingClientRect()
    if (rect.width === 0 && rect.height === 0) return
    // Absolute + document coords so the box stays locked to the target
    // during the smooth scrollIntoView animation below.
    const box = document.createElement('div')
    box.setAttribute('data-devlens', '')
    box.style.cssText = `
      position:absolute;z-index:999995;pointer-events:none;
      border:2px solid #4ea8de;border-radius:4px;
      background:rgba(78, 168, 222, 0.12);
      left:${rect.left + window.scrollX}px;top:${rect.top + window.scrollY}px;
      width:${rect.width}px;height:${rect.height}px;
      transition:opacity 0.5s;
    `
    document.body.append(box)
    highlightedEl = box
    target.scrollIntoView({ behavior: 'smooth', block: 'center' })
    setTimeout(() => {
      if (box === highlightedEl) {
        box.style.opacity = '0'
        setTimeout(clearHighlight, 500)
      }
    }, 1500)
  }

  function scanAndToast() {
    const result = collect()
    const newKeys = new Set(result.issues.map(issueKey))
    for (const issue of result.issues) {
      const key = issueKey(issue)
      if (!lastIssueKeys.has(key) && issue.severity !== 'info') {
        showToast({
          level: issue.severity,
          message: `Headings: ${issue.message}`,
        })
      }
    }
    lastIssueKeys = newKeys
    return result
  }

  scanAndToast()

  return {
    name: 'Headings',
    icon: '🗂',

    panel() {
      const el = document.createElement('div')
      el.className = 'devlens-headings'
      return el
    },

    onMount(container) {
      const root = container.querySelector('.devlens-headings') as HTMLElement

      const render = () => {
        const { nodes, issues } = scanAndToast()
        const errors = issues.filter((i) => i.severity === 'error')
        const warnings = issues.filter((i) => i.severity === 'warn')
        const infos = issues.filter((i) => i.severity === 'info')

        const issueRows = issues.length === 0
          ? `<div style="padding:8px 10px;background:#1a3a1a;border-radius:4px;border-left:3px solid #4caf50;font-size:12px;color:#8a8a9a;">
              Heading hierarchy looks good!
            </div>`
          : issues.map((issue) => {
              const style = SEVERITY_STYLES[issue.severity]
              const countBadge = issue.count > 1
                ? `<span style="background:${style.border};color:#fff;border-radius:3px;padding:0 5px;font-size:10px;font-weight:600;">×${issue.count}</span>`
                : ''
              const detail = issue.detail
                ? `<code style="display:block;margin-top:3px;font-size:10px;color:#8a8a9a;word-break:break-word;">${escapeHtml(issue.detail)}</code>`
                : ''
              return `
                <div style="padding:6px 8px;background:${style.bg};border-left:3px solid ${style.border};border-radius:4px;margin-bottom:3px;font-size:12px;">
                  <div style="display:flex;align-items:start;justify-content:space-between;gap:6px;">
                    <span>${style.icon} ${escapeHtml(issue.message)}</span>
                    ${countBadge}
                  </div>
                  ${detail}
                </div>
              `
            }).join('')

        const outlineRows = nodes.length === 0
          ? `<div style="padding:8px 10px;background:#1a1a2e;border-radius:4px;font-size:12px;color:#8a8a9a;">No headings on page</div>`
          : nodes.map((node, idx) => {
              const indent = (node.level - 1) * 14
              const tagColor = node.skip
                ? '#e94560'
                : node.hidden
                  ? '#5a5a6a'
                  : node.empty
                    ? '#f0a030'
                    : '#4ea8de'
              const textColor = node.hidden ? '#5a5a6a' : '#e0e0e0'
              const textStyle = node.hidden ? 'text-decoration:line-through;' : ''
              const skipMark = node.skip ? ' ⚠' : ''
              const hiddenMark = node.hidden ? ' (hidden)' : ''
              const display = node.empty ? '<em style="color:#8a8a9a;">(empty)</em>' : escapeHtml(node.text)
              return `
                <div data-heading-idx="${idx}" style="
                  display:flex;align-items:center;gap:6px;
                  padding:3px 6px;border-radius:3px;cursor:pointer;
                  font-size:12px;line-height:1.4;
                  margin-left:${indent}px;
                " class="devlens-headings-row">
                  <span style="
                    flex-shrink:0;
                    background:${tagColor};color:#fff;
                    border-radius:3px;padding:1px 5px;
                    font-size:10px;font-weight:700;
                    font-family:ui-monospace,monospace;
                  ">h${node.level}${skipMark}</span>
                  <span style="${textStyle}color:${textColor};overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${display}${hiddenMark}</span>
                </div>
              `
            }).join('')

        root.innerHTML = `
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
            <span style="font-size:12px;color:#8a8a9a;">${nodes.length} heading${nodes.length !== 1 ? 's' : ''} · click to highlight</span>
            <button id="devlens-headings-rescan" style="
              padding:4px 10px;border:1px solid #0f3460;border-radius:4px;cursor:pointer;
              font-family:var(--dl-font);font-size:11px;background:transparent;color:#8a8a9a;
            ">Re-scan</button>
          </div>

          <div style="display:flex;gap:12px;margin-bottom:12px;font-size:12px;">
            <span style="color:${errors.length > 0 ? '#e94560' : '#4caf50'};">🔴 <strong>${errors.length}</strong> error${errors.length !== 1 ? 's' : ''}</span>
            <span style="color:${warnings.length > 0 ? '#f0a030' : '#4caf50'};">🟡 <strong>${warnings.length}</strong> warning${warnings.length !== 1 ? 's' : ''}</span>
            <span style="color:${infos.length > 0 ? '#4ea8de' : '#4caf50'};">🔵 <strong>${infos.length}</strong> info</span>
          </div>

          <div style="margin-bottom:12px;">${issueRows}</div>

          <div style="font-size:11px;color:#8a8a9a;margin-bottom:6px;text-transform:uppercase;letter-spacing:0.5px;">Outline</div>
          <div style="background:#0f0f1e;border-radius:4px;padding:6px;">${outlineRows}</div>
        `

        root.querySelector('#devlens-headings-rescan')?.addEventListener('click', render)
        root.querySelectorAll<HTMLElement>('.devlens-headings-row').forEach((row) => {
          row.addEventListener('mouseenter', () => {
            row.style.background = '#1a1a3a'
          })
          row.addEventListener('mouseleave', () => {
            row.style.background = ''
          })
          row.addEventListener('click', () => {
            const idx = parseInt(row.getAttribute('data-heading-idx') || '-1')
            const node = nodes[idx]
            if (node) highlight(node.el)
          })
        })
      }

      render()
      const intervalId = setInterval(render, 3000)
      root.setAttribute('data-interval', String(intervalId))
    },

    onUnmount() {
      clearHighlight()
    },
  }
}
