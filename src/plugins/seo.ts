/**
 * SEO plugin — checks on-page SEO signals: title and description length,
 * Open Graph required/recommended tags (ogp.me), Twitter Card markup,
 * canonical URL, robots meta, charset, viewport, hreflang, JSON-LD and
 * heading presence. Classifies each issue as error / warn / info.
 */
import type { DevLensPlugin } from '../types'
import { showToast } from '../toasts'

type Severity = 'error' | 'warn' | 'info'

type Category =
  | 'Title'
  | 'Description'
  | 'Open Graph'
  | 'Twitter'
  | 'Canonical'
  | 'Robots'
  | 'Structure'
  | 'Images'
  | 'Structured Data'
  | 'i18n'

interface SEOIssue {
  severity: Severity
  category: Category
  message: string
  detail?: string
  count: number
}

const SEVERITY_STYLES: Record<Severity, { bg: string; border: string; icon: string }> = {
  error: { bg: '#3a1a1a', border: '#e94560', icon: '🔴' },
  warn: { bg: '#3a2e1a', border: '#f0a030', icon: '🟡' },
  info: { bg: '#1a2a3a', border: '#4ea8de', icon: '🔵' },
}

const TITLE_MIN = 30
const TITLE_MAX = 60
const DESC_MAX = 160
const DESC_MIN = 70

const OG_REQUIRED = ['og:title', 'og:type', 'og:image', 'og:url'] as const
const OG_RECOMMENDED = ['og:description', 'og:site_name', 'og:locale'] as const
const TWITTER_RECOMMENDED = ['twitter:title', 'twitter:description', 'twitter:image'] as const
const VALID_TWITTER_CARDS = ['summary', 'summary_large_image', 'app', 'player']

const IMAGE_EXT_RE = /\.(jpe?g|png|webp|gif|svg|avif|bmp|tiff?)$/i
// BCP 47: primary language (2-3 letters) + optional region, script, or variant subtags.
// Case-insensitive — `en-US`, `en-us`, `fr` and `zh-Hant` are all valid.
const BCP47_RE = /^[a-zA-Z]{2,3}(-[a-zA-Z0-9]+)*$/

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function getMeta(name: string): HTMLMetaElement | null {
  return document.querySelector<HTMLMetaElement>(`meta[name="${name}" i]`)
}

function getMetaProp(prop: string): HTMLMetaElement | null {
  return document.querySelector<HTMLMetaElement>(`meta[property="${prop}" i]`)
}

function getMetaContent(el: HTMLMetaElement | null): string {
  return (el?.getAttribute('content') || '').trim()
}

function isAbsoluteUrl(url: string): boolean {
  return /^https?:\/\//i.test(url)
}

function runAudit(): SEOIssue[] {
  const issues: SEOIssue[] = []

  function add(severity: Severity, category: Category, message: string, detail?: string) {
    const existing = issues.find((i) => i.message === message && i.category === category)
    if (existing) {
      existing.count++
    } else {
      issues.push({ severity, category, message, detail, count: 1 })
    }
  }

  // ---------- Title ----------
  const title = (document.title || '').trim()
  if (!title) {
    add('error', 'Title', 'Missing or empty <title>')
  } else {
    if (title.length > TITLE_MAX) {
      add('warn', 'Title', `Title too long (${title.length} chars, aim for ≤ ${TITLE_MAX})`, title)
    } else if (title.length < TITLE_MIN) {
      add('info', 'Title', `Title short (${title.length} chars, aim for ${TITLE_MIN}–${TITLE_MAX})`, title)
    }
    const titleTags = document.querySelectorAll('title')
    if (titleTags.length > 1) {
      add('warn', 'Title', `${titleTags.length} <title> tags found — should be unique`)
    }
  }

  // ---------- Meta description ----------
  const descEl = getMeta('description')
  const desc = getMetaContent(descEl)
  if (!descEl) {
    add('warn', 'Description', 'Missing meta description')
  } else if (!desc) {
    add('warn', 'Description', 'Empty meta description')
  } else {
    if (desc.length > DESC_MAX) {
      add('info', 'Description', `Description long (${desc.length} chars, ~${DESC_MAX} max in SERP)`, desc)
    } else if (desc.length < DESC_MIN) {
      add('info', 'Description', `Description short (${desc.length} chars, aim for ${DESC_MIN}–${DESC_MAX})`, desc)
    }
    if (desc === title) {
      add('info', 'Description', 'Description duplicates title')
    }
  }

  // ---------- Open Graph ----------
  for (const prop of OG_REQUIRED) {
    const el = getMetaProp(prop)
    if (!el || !getMetaContent(el)) {
      add('error', 'Open Graph', `Missing required ${prop}`)
    }
  }
  for (const prop of OG_RECOMMENDED) {
    const el = getMetaProp(prop)
    if (!el || !getMetaContent(el)) {
      add('warn', 'Open Graph', `Missing recommended ${prop}`)
    }
  }
  const ogImage = getMetaContent(getMetaProp('og:image'))
  if (ogImage) {
    if (!isAbsoluteUrl(ogImage)) {
      add('warn', 'Open Graph', 'og:image should be an absolute URL', ogImage)
    }
    const w = getMetaContent(getMetaProp('og:image:width'))
    const h = getMetaContent(getMetaProp('og:image:height'))
    if (!w || !h) {
      add('info', 'Open Graph', 'og:image:width / og:image:height not declared (recommended 1200×630)')
    }
  }
  const ogUrl = getMetaContent(getMetaProp('og:url'))
  if (ogUrl && !isAbsoluteUrl(ogUrl)) {
    add('warn', 'Open Graph', 'og:url should be an absolute URL', ogUrl)
  }

  // ---------- Twitter Card ----------
  const twCard = getMetaContent(getMeta('twitter:card'))
  if (!twCard) {
    add('error', 'Twitter', 'Missing twitter:card')
  } else if (!VALID_TWITTER_CARDS.includes(twCard)) {
    add('warn', 'Twitter', `Invalid twitter:card "${twCard}" — expected one of ${VALID_TWITTER_CARDS.join(', ')}`)
  }
  for (const name of TWITTER_RECOMMENDED) {
    const tw = getMetaContent(getMeta(name))
    if (!tw) {
      const ogFallback = getMetaContent(getMetaProp(name.replace('twitter:', 'og:')))
      if (ogFallback) {
        add('info', 'Twitter', `${name} missing — falling back to ${name.replace('twitter:', 'og:')}`)
      } else {
        add('warn', 'Twitter', `Missing ${name}`)
      }
    }
  }

  // ---------- Canonical ----------
  const canonicals = document.querySelectorAll<HTMLLinkElement>('link[rel="canonical"]')
  if (canonicals.length > 1) {
    add('error', 'Canonical', `${canonicals.length} canonical links found — should be unique`)
  }
  if (canonicals.length === 1) {
    const href = canonicals[0].getAttribute('href') || ''
    if (!href) {
      add('error', 'Canonical', 'Canonical href is empty')
    } else {
      if (!isAbsoluteUrl(href)) {
        add('warn', 'Canonical', 'Canonical should be an absolute URL', href)
      }
      if (href.includes('#')) {
        add('warn', 'Canonical', 'Canonical contains a fragment (#)', href)
      }
    }
  }

  // ---------- Robots ----------
  const robots = getMetaContent(getMeta('robots')).toLowerCase()
  if (robots) {
    if (/\bnoindex\b|\bnone\b/.test(robots)) {
      add('warn', 'Robots', `<meta robots> sets "${robots}" — page will not be indexed`)
      if (canonicals.length > 0) {
        add('warn', 'Canonical', 'Canonical present but robots noindex — conflicting signals')
      }
    }
    if (/\bnofollow\b/.test(robots)) {
      add('info', 'Robots', `<meta robots> sets "nofollow"`)
    }
  }

  // ---------- Structure ----------
  const html = document.documentElement
  const lang = html.getAttribute('lang')
  if (!lang) {
    add('error', 'Structure', 'Missing lang attribute on <html>')
  } else if (!BCP47_RE.test(lang)) {
    add('warn', 'Structure', `<html lang="${lang}"> is not a valid BCP 47 tag`)
  }

  const charsetEl = document.querySelector<HTMLMetaElement>('meta[charset]')
  if (!charsetEl) {
    add('error', 'Structure', 'Missing <meta charset>')
  } else {
    const charset = (charsetEl.getAttribute('charset') || '').toLowerCase()
    if (charset !== 'utf-8') {
      add('error', 'Structure', `<meta charset="${charset}"> should be utf-8`)
    }
  }

  const viewportEl = getMeta('viewport')
  const viewport = getMetaContent(viewportEl)
  if (!viewportEl) {
    add('error', 'Structure', 'Missing <meta name="viewport">')
  } else {
    if (/user-scalable\s*=\s*no/i.test(viewport) || /maximum-scale\s*=\s*1\b/i.test(viewport)) {
      add('warn', 'Structure', 'Viewport disables user scaling — accessibility concern', viewport)
    }
  }

  const h1s = document.querySelectorAll('h1')
  if (h1s.length === 0) {
    add('warn', 'Structure', 'No <h1> on page')
  } else if (h1s.length > 1) {
    add('info', 'Structure', `${h1s.length} <h1> elements found (Google allows multiple, but one is conventional)`)
  }
  for (const h of h1s) {
    if (!(h.textContent || '').trim()) {
      add('warn', 'Structure', 'Empty <h1>')
    }
  }

  // ---------- Images ----------
  const imgs = document.querySelectorAll<HTMLImageElement>('img')
  for (const img of imgs) {
    if (img.closest('#devlens')) continue
    const alt = img.getAttribute('alt')
    if (alt && IMAGE_EXT_RE.test(alt.trim())) {
      add('warn', 'Images', 'Image alt looks like a filename', alt)
    }
    if (alt && alt.length > 125) {
      add('info', 'Images', `Image alt > 125 chars (${alt.length})`, alt)
    }
  }

  // ---------- Structured data ----------
  const jsonLdNodes = document.querySelectorAll<HTMLScriptElement>('script[type="application/ld+json"]')
  if (jsonLdNodes.length === 0) {
    add('info', 'Structured Data', 'No JSON-LD structured data found')
  } else {
    for (const node of jsonLdNodes) {
      try {
        JSON.parse(node.textContent || '')
      } catch (e) {
        add('warn', 'Structured Data', 'JSON-LD parse error', (e as Error).message)
      }
    }
  }

  // ---------- Favicon ----------
  const favicon = document.querySelector(
    'link[rel="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"]',
  )
  if (!favicon) {
    add('info', 'Structure', 'No favicon link found')
  }

  // ---------- Hreflang ----------
  const hreflangs = document.querySelectorAll<HTMLLinkElement>('link[rel="alternate"][hreflang]')
  if (hreflangs.length >= 2) {
    let hasSelf = false
    let hasDefault = false
    const currentUrl = location.href.replace(/#.*$/, '')
    for (const link of hreflangs) {
      const code = link.getAttribute('hreflang') || ''
      const href = link.getAttribute('href') || ''
      if (code.toLowerCase() === 'x-default') hasDefault = true
      if (href && !isAbsoluteUrl(href)) {
        add('warn', 'i18n', `hreflang "${code}" uses a relative URL`, href)
      }
      if (code !== 'x-default' && !BCP47_RE.test(code)) {
        add('warn', 'i18n', `hreflang "${code}" is not a valid BCP 47 tag`)
      }
      if (href && href.replace(/#.*$/, '') === currentUrl) hasSelf = true
    }
    if (!hasSelf) {
      add('error', 'i18n', 'hreflang set is missing a self-referencing link')
    }
    if (!hasDefault) {
      add('info', 'i18n', 'hreflang set has no x-default')
    }
  }

  return issues
}

export function seoPlugin(): DevLensPlugin {
  let lastIssueKeys = new Set<string>()

  function issueKey(i: SEOIssue): string {
    return `${i.severity}:${i.category}:${i.message}`
  }

  function scanAndToast(): SEOIssue[] {
    const issues = runAudit()
    const newKeys = new Set(issues.map(issueKey))
    for (const issue of issues) {
      const key = issueKey(issue)
      if (!lastIssueKeys.has(key)) {
        showToast({
          level: issue.severity,
          message: `SEO [${issue.category}]: ${issue.message}`,
        })
      }
    }
    lastIssueKeys = newKeys
    return issues
  }

  scanAndToast()

  return {
    name: 'SEO',
    icon: '🔍',

    panel() {
      const el = document.createElement('div')
      el.className = 'devlens-seo'
      return el
    },

    onMount(container) {
      const root = container.querySelector('.devlens-seo') as HTMLElement
      let refreshInterval: ReturnType<typeof setInterval> | null = null

      const render = () => {
        const issues = scanAndToast()
        const errors = issues.filter((i) => i.severity === 'error')
        const warnings = issues.filter((i) => i.severity === 'warn')
        const infos = issues.filter((i) => i.severity === 'info')

        const categories = [...new Set(issues.map((i) => i.category))]

        const issueRows = issues.length === 0
          ? `<div style="padding:8px 10px;background:#1a3a1a;border-radius:4px;border-left:3px solid #4caf50;font-size:12px;color:#8a8a9a;">
              No SEO issues detected!
            </div>`
          : categories.map((cat) => {
              const catIssues = issues.filter((i) => i.category === cat)
              return `
                <div style="margin-bottom:10px;">
                  <div style="font-size:11px;color:#8a8a9a;margin-bottom:4px;text-transform:uppercase;letter-spacing:0.5px;">${cat}</div>
                  ${catIssues.map((issue) => {
                    const style = SEVERITY_STYLES[issue.severity]
                    const countBadge = issue.count > 1
                      ? `<span style="background:${style.border};color:#fff;border-radius:3px;padding:0 5px;font-size:10px;font-weight:600;">×${issue.count}</span>`
                      : ''
                    const detail = issue.detail
                      ? `<code style="display:block;margin-top:3px;font-size:10px;color:#8a8a9a;word-break:break-all;">${escapeHtml(issue.detail)}</code>`
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
                  }).join('')}
                </div>
              `
            }).join('')

        root.innerHTML = `
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
            <span style="font-size:12px;color:#8a8a9a;">Auto-scans every 3s</span>
            <button id="devlens-seo-rescan" style="
              padding:4px 10px;border:1px solid #0f3460;border-radius:4px;cursor:pointer;
              font-family:var(--dl-font);font-size:11px;background:transparent;color:#8a8a9a;
            ">Re-scan</button>
          </div>

          <div style="display:flex;gap:12px;margin-bottom:12px;font-size:12px;">
            <span style="color:${errors.length > 0 ? '#e94560' : '#4caf50'};">🔴 <strong>${errors.length}</strong> error${errors.length !== 1 ? 's' : ''}</span>
            <span style="color:${warnings.length > 0 ? '#f0a030' : '#4caf50'};">🟡 <strong>${warnings.length}</strong> warning${warnings.length !== 1 ? 's' : ''}</span>
            <span style="color:${infos.length > 0 ? '#4ea8de' : '#4caf50'};">🔵 <strong>${infos.length}</strong> info</span>
          </div>

          ${issueRows}
        `

        root.querySelector('#devlens-seo-rescan')?.addEventListener('click', render)
      }

      render()
      refreshInterval = setInterval(render, 3000)
      root.setAttribute('data-interval', String(refreshInterval))
    },

    onUnmount() {},
  }
}
