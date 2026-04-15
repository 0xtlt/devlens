/**
 * Network plugin — reads the Resource Timing API to summarize requests,
 * group them by domain, and surface warnings about slow or oversized
 * transfers. Read-only: it never patches `fetch` or `XMLHttpRequest`.
 */
import type { DevLensPlugin } from '../types.js'

interface NetworkWarning {
  level: 'warn' | 'error'
  message: string
}

interface DomainStats {
  count: number
  totalSize: number
  slowest: number
}

const THRESHOLDS = {
  slowRequest: 1000,
  verySlowRequest: 3000,
  largeResource: 500 * 1024,
  tooManyResources: 80,
  tooManyDomains: 10,
  tooManyPerDomain: 20,
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatMs(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`
  return `${(ms / 1000).toFixed(2)}s`
}

function getDomain(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return url
  }
}

function getResourceType(entry: PerformanceResourceTiming): string {
  if (entry.initiatorType === 'xmlhttprequest' || entry.initiatorType === 'fetch') return 'fetch'
  if (entry.initiatorType === 'script') return 'js'
  if (entry.initiatorType === 'link' || entry.initiatorType === 'css') return 'css'
  if (entry.initiatorType === 'img') return 'img'
  return entry.initiatorType || 'other'
}

function analyze() {
  const entries = performance.getEntriesByType('resource') as PerformanceResourceTiming[]
  const warnings: NetworkWarning[] = []
  const domains = new Map<string, DomainStats>()

  for (const entry of entries) {
    const domain = getDomain(entry.name)
    const duration = entry.responseEnd - entry.startTime
    const size = entry.transferSize || 0

    const stats = domains.get(domain) || { count: 0, totalSize: 0, slowest: 0 }
    stats.count++
    stats.totalSize += size
    stats.slowest = Math.max(stats.slowest, duration)
    domains.set(domain, stats)
  }

  // Total resources
  if (entries.length > THRESHOLDS.tooManyResources) {
    warnings.push({
      level: 'error',
      message: `${entries.length} resources loaded — too many, consider bundling or lazy loading`,
    })
  } else if (entries.length > THRESHOLDS.tooManyResources * 0.7) {
    warnings.push({
      level: 'warn',
      message: `${entries.length} resources loaded — getting high`,
    })
  }

  // Too many domains
  if (domains.size > THRESHOLDS.tooManyDomains) {
    warnings.push({
      level: 'error',
      message: `${domains.size} different domains — too many origins, increases DNS/connection overhead`,
    })
  } else if (domains.size > THRESHOLDS.tooManyDomains * 0.6) {
    warnings.push({
      level: 'warn',
      message: `${domains.size} different domains — consider reducing third-party dependencies`,
    })
  }

  // Per-domain warnings
  for (const [domain, stats] of domains) {
    if (stats.count > THRESHOLDS.tooManyPerDomain) {
      warnings.push({
        level: 'warn',
        message: `${stats.count} requests to ${domain} — consider bundling`,
      })
    }
  }

  // Slow requests
  const slowRequests = entries.filter((e) => e.responseEnd - e.startTime > THRESHOLDS.slowRequest)
  const verySlowRequests = entries.filter((e) => e.responseEnd - e.startTime > THRESHOLDS.verySlowRequest)

  if (verySlowRequests.length > 0) {
    warnings.push({
      level: 'error',
      message: `${verySlowRequests.length} request(s) over ${formatMs(THRESHOLDS.verySlowRequest)}`,
    })
  } else if (slowRequests.length > 0) {
    warnings.push({
      level: 'warn',
      message: `${slowRequests.length} request(s) over ${formatMs(THRESHOLDS.slowRequest)}`,
    })
  }

  // Large resources
  const largeResources = entries.filter((e) => (e.transferSize || 0) > THRESHOLDS.largeResource)
  if (largeResources.length > 0) {
    warnings.push({
      level: 'warn',
      message: `${largeResources.length} resource(s) over ${formatBytes(THRESHOLDS.largeResource)}`,
    })
  }

  const totalSize = entries.reduce((sum, e) => sum + (e.transferSize || 0), 0)

  return { entries, warnings, domains, totalSize, slowRequests, largeResources }
}

function renderWarnings(warnings: NetworkWarning[]): string {
  if (warnings.length === 0) {
    return `<div style="padding:6px 10px;background:#1a3a1a;border-radius:4px;border-left:3px solid #4caf50;margin-bottom:10px;">All good — no issues detected</div>`
  }

  return warnings
    .map((w) => {
      const isError = w.level === 'error'
      const bg = isError ? '#3a1a1a' : '#3a2e1a'
      const border = isError ? '#e94560' : '#f0a030'
      const icon = isError ? '🔴' : '🟡'
      return `<div style="padding:6px 10px;background:${bg};border-radius:4px;border-left:3px solid ${border};margin-bottom:4px;">${icon} ${w.message}</div>`
    })
    .join('')
}

function renderDomains(domains: Map<string, DomainStats>): string {
  const sorted = [...domains.entries()].sort((a, b) => b[1].count - a[1].count)

  const rows = sorted
    .map(([domain, stats]) => {
      const slowColor = stats.slowest > THRESHOLDS.verySlowRequest ? '#e94560' : stats.slowest > THRESHOLDS.slowRequest ? '#f0a030' : '#4caf50'
      return `<tr>
        <td style="padding:4px 8px;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${domain}">${domain}</td>
        <td style="padding:4px 8px;text-align:right;">${stats.count}</td>
        <td style="padding:4px 8px;text-align:right;">${formatBytes(stats.totalSize)}</td>
        <td style="padding:4px 8px;text-align:right;color:${slowColor}">${formatMs(stats.slowest)}</td>
      </tr>`
    })
    .join('')

  return `
    <table style="width:100%;border-collapse:collapse;font-size:12px;">
      <thead>
        <tr style="color:#8a8a9a;border-bottom:1px solid #0f3460;">
          <th style="padding:4px 8px;text-align:left;">Domain</th>
          <th style="padding:4px 8px;text-align:right;">Reqs</th>
          <th style="padding:4px 8px;text-align:right;">Size</th>
          <th style="padding:4px 8px;text-align:right;">Slowest</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `
}

function renderRequests(entries: PerformanceResourceTiming[]): string {
  const sorted = [...entries].sort((a, b) => (b.responseEnd - b.startTime) - (a.responseEnd - a.startTime))
  const top = sorted.slice(0, 30)

  const rows = top
    .map((e) => {
      const duration = e.responseEnd - e.startTime
      const size = e.transferSize || 0
      const path = new URL(e.name, location.origin).pathname.split('/').pop() || e.name
      const type = getResourceType(e)
      const durColor = duration > THRESHOLDS.verySlowRequest ? '#e94560' : duration > THRESHOLDS.slowRequest ? '#f0a030' : '#e0e0e0'
      const sizeColor = size > THRESHOLDS.largeResource ? '#f0a030' : '#e0e0e0'

      return `<tr>
        <td style="padding:3px 6px;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${e.name}">${path}</td>
        <td style="padding:3px 6px;color:#8a8a9a;">${type}</td>
        <td style="padding:3px 6px;text-align:right;color:${durColor}">${formatMs(duration)}</td>
        <td style="padding:3px 6px;text-align:right;color:${sizeColor}">${formatBytes(size)}</td>
      </tr>`
    })
    .join('')

  return `
    <div style="color:#8a8a9a;font-size:11px;margin-bottom:4px;">Top ${top.length} slowest of ${entries.length} total</div>
    <table style="width:100%;border-collapse:collapse;font-size:12px;">
      <thead>
        <tr style="color:#8a8a9a;border-bottom:1px solid #0f3460;">
          <th style="padding:3px 6px;text-align:left;">Resource</th>
          <th style="padding:3px 6px;text-align:left;">Type</th>
          <th style="padding:3px 6px;text-align:right;">Time</th>
          <th style="padding:3px 6px;text-align:right;">Size</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `
}

export function networkPlugin(): DevLensPlugin {
  let interval: ReturnType<typeof setInterval> | undefined

  return {
    name: 'Network',
    icon: '🌐',
    panel: () => '<div class="devlens-network"></div>',

    onMount(container) {
      const render = () => {
        const el = container.querySelector('.devlens-network')
        if (!el) return
        const { entries, warnings, domains, totalSize } = analyze()

        el.innerHTML = `
          <div style="display:flex;gap:16px;margin-bottom:10px;font-size:12px;color:#8a8a9a;">
            <span><strong style="color:#e0e0e0">${entries.length}</strong> requests</span>
            <span><strong style="color:#e0e0e0">${formatBytes(totalSize)}</strong> transferred</span>
            <span><strong style="color:#e0e0e0">${domains.size}</strong> domains</span>
          </div>
          <div style="margin-bottom:12px;">${renderWarnings(warnings)}</div>
          <details open style="margin-bottom:12px;">
            <summary style="cursor:pointer;color:#8a8a9a;font-size:12px;margin-bottom:6px;">Domains</summary>
            ${renderDomains(domains)}
          </details>
          <details style="margin-bottom:8px;">
            <summary style="cursor:pointer;color:#8a8a9a;font-size:12px;margin-bottom:6px;">Requests</summary>
            ${renderRequests(entries)}
          </details>
        `
      }

      render()
      interval = setInterval(render, 3000)
    },

    onUnmount() {
      if (interval) clearInterval(interval)
    },
  }
}
