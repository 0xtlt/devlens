/**
 * Console plugin — hooks `console.error`, `console.warn`, uncaught errors
 * and unhandled promise rejections, then mirrors them as toasts (when
 * active) and keeps the last 50 entries for the panel list.
 */
import type { DevLensPlugin } from '../types'
import { showToast } from '../toasts'
import type { ToastLevel } from '../toasts'

interface LogEntry {
  level: ToastLevel
  message: string
  timestamp: number
  count: number
}

const STORAGE_KEY = 'devlens:console'
const MAX_LOG_ENTRIES = 50

const LEVEL_STYLES: Record<ToastLevel, { bg: string; border: string; icon: string }> = {
  error: { bg: '#3a1a1a', border: '#e94560', icon: '🔴' },
  warn: { bg: '#3a2e1a', border: '#f0a030', icon: '🟡' },
  info: { bg: '#1a2a3a', border: '#4ea8de', icon: '🔵' },
}

function loadActive(): boolean {
  try { return localStorage.getItem(STORAGE_KEY) === '1' } catch { return false }
}

function saveActive(v: boolean) {
  try { localStorage.setItem(STORAGE_KEY, v ? '1' : '0') } catch {}
}

function formatMessage(args: unknown[]): string {
  return args
    .map((a) => {
      if (typeof a === 'string') return a
      if (a instanceof Error) return `${a.name}: ${a.message}`
      try { return JSON.stringify(a) } catch { return String(a) }
    })
    .join(' ')
}

function truncate(str: string, max: number): string {
  return str.length > max ? str.slice(0, max) + '…' : str
}

export function consolePlugin(): DevLensPlugin {
  let active = loadActive()
  const logs: LogEntry[] = []

  const origError = console.error
  const origWarn = console.warn

  function addLog(level: ToastLevel, args: unknown[]) {
    const message = formatMessage(args)

    const last = logs[0]
    if (last && last.level === level && last.message === message) {
      last.count++
      last.timestamp = Date.now()
      if (active) showToast({ level, message, count: last.count })
      return
    }

    const entry: LogEntry = { level, message, timestamp: Date.now(), count: 1 }
    logs.unshift(entry)
    if (logs.length > MAX_LOG_ENTRIES) logs.pop()
    if (active) showToast({ level, message })
  }

  function hookConsole() {
    console.error = (...args: unknown[]) => {
      origError.apply(console, args)
      addLog('error', args)
    }
    console.warn = (...args: unknown[]) => {
      origWarn.apply(console, args)
      addLog('warn', args)
    }

    window.addEventListener('error', (e) => {
      addLog('error', [e.message || 'Uncaught error'])
    })
    window.addEventListener('unhandledrejection', (e) => {
      addLog('error', [`Unhandled rejection: ${e.reason}`])
    })
  }

  function start() {
    if (active) return
    active = true
    saveActive(true)
  }

  function stop() {
    if (!active) return
    active = false
    saveActive(false)
  }

  hookConsole()

  return {
    name: 'Console',
    icon: '🚨',

    panel() {
      const el = document.createElement('div')
      el.className = 'devlens-console'
      return el
    },

    onMount(container) {
      const root = container.querySelector('.devlens-console') as HTMLElement

      const render = () => {
        const logRows = logs.length === 0
          ? '<div style="color:#8a8a9a;font-size:12px;padding:8px 0;">No errors or warnings captured yet.</div>'
          : logs.slice(0, 20).map((entry) => {
              const style = LEVEL_STYLES[entry.level]
              const time = new Date(entry.timestamp).toLocaleTimeString()
              const countBadge = entry.count > 1 ? `<span style="background:${style.border};color:#fff;border-radius:3px;padding:0 4px;font-size:10px;font-weight:600;margin-left:4px;">x${entry.count}</span>` : ''
              return `
                <div style="padding:6px 8px;background:${style.bg};border-left:3px solid ${style.border};border-radius:4px;margin-bottom:4px;font-size:12px;word-break:break-word;">
                  <div style="display:flex;align-items:start;gap:6px;">
                    <span>${style.icon}</span>
                    <span style="flex:1;">${truncate(entry.message, 300)}${countBadge}</span>
                    <span style="color:#8a8a9a;font-size:10px;flex-shrink:0;">${time}</span>
                  </div>
                </div>
              `
            }).join('')

        root.innerHTML = `
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
            <span style="font-size:12px;color:#8a8a9a;">Show errors & warnings as toasts</span>
            <div style="display:flex;gap:6px;">
              ${logs.length > 0 ? `<button id="devlens-console-clear" style="
                padding:4px 10px;border:1px solid #0f3460;border-radius:4px;cursor:pointer;
                font-family:var(--dl-font);font-size:11px;background:transparent;color:#8a8a9a;
              ">Clear</button>` : ''}
              <button id="devlens-console-toggle" style="
                padding:4px 14px;border:none;border-radius:4px;cursor:pointer;
                font-family:var(--dl-font);font-size:12px;font-weight:600;
                background:${active ? '#3a1a1a' : '#1a3a1a'};
                color:${active ? '#e94560' : '#4caf50'};
                border:1px solid ${active ? '#e94560' : '#4caf50'};
              ">${active ? 'Stop' : 'Start'}</button>
            </div>
          </div>

          <div style="margin-bottom:8px;">${logRows}</div>
        `

        root.querySelector('#devlens-console-toggle')?.addEventListener('click', () => {
          if (active) stop()
          else start()
          render()
        })

        root.querySelector('#devlens-console-clear')?.addEventListener('click', () => {
          logs.length = 0
          render()
        })
      }

      render()
      const refreshInterval = setInterval(render, 2000)
      root.setAttribute('data-interval', String(refreshInterval))
    },

    onUnmount() {},
  }
}
