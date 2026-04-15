/**
 * Toast notifications rendered in the top-right corner. Used by plugins
 * to surface events (errors, new issues) without requiring the panel to
 * be open. Auto-dismiss after 5s, click to dismiss early, max 5 visible.
 */
export type ToastLevel = 'error' | 'warn' | 'info'

export interface ToastOptions {
  level: ToastLevel
  message: string
  count?: number
  duration?: number
}

const CONTAINER_ID = 'devlens-toasts'
const MAX_TOASTS = 5
const DEFAULT_DURATION = 5000

const LEVEL_STYLES: Record<ToastLevel, { bg: string; border: string; icon: string }> = {
  error: { bg: '#3a1a1a', border: '#e94560', icon: '🔴' },
  warn: { bg: '#3a2e1a', border: '#f0a030', icon: '🟡' },
  info: { bg: '#1a2a3a', border: '#4ea8de', icon: '🔵' },
}

function truncate(str: string, max: number): string {
  return str.length > max ? str.slice(0, max) + '…' : str
}

let container: HTMLElement | null = null

function ensureContainer(): HTMLElement {
  if (container && document.body.contains(container)) return container
  container = document.createElement('div')
  container.id = CONTAINER_ID
  container.setAttribute('data-devlens', '')
  container.style.cssText = `
    position:fixed;top:16px;right:16px;z-index:999997;
    display:flex;flex-direction:column;gap:8px;
    pointer-events:none;max-width:420px;
  `
  document.body.append(container)
  return container
}

function dismiss(toast: HTMLElement) {
  toast.style.opacity = '0'
  toast.style.transform = 'translateX(40px)'
  setTimeout(() => toast.remove(), 250)
}

export function showToast(options: ToastOptions) {
  const ctn = ensureContainer()
  const style = LEVEL_STYLES[options.level]
  const duration = options.duration ?? DEFAULT_DURATION

  const toast = document.createElement('div')
  toast.style.cssText = `
    background:${style.bg};border:1px solid ${style.border};border-left:3px solid ${style.border};
    border-radius:6px;padding:8px 12px;
    font-family:ui-monospace,'SF Mono','Cascadia Code',monospace;font-size:12px;
    color:#e0e0e0;line-height:1.4;
    box-shadow:0 4px 16px rgba(0,0,0,0.4);
    pointer-events:auto;cursor:pointer;
    opacity:0;transform:translateX(40px);
    transition:all 0.25s ease;
    max-width:100%;word-break:break-word;
  `

  const countBadge = options.count && options.count > 1
    ? `<span style="background:${style.border};color:#fff;border-radius:3px;padding:0 5px;font-size:10px;font-weight:600;margin-left:6px;">x${options.count}</span>`
    : ''

  toast.innerHTML = `
    <div style="display:flex;align-items:start;gap:6px;">
      <span style="flex-shrink:0;">${style.icon}</span>
      <span style="flex:1;overflow:hidden;">${truncate(options.message, 200)}${countBadge}</span>
    </div>
  `

  toast.addEventListener('click', () => dismiss(toast))
  ctn.append(toast)

  requestAnimationFrame(() => {
    toast.style.opacity = '1'
    toast.style.transform = 'translateX(0)'
  })

  while (ctn.children.length > MAX_TOASTS) {
    ctn.firstElementChild?.remove()
  }

  setTimeout(() => dismiss(toast), duration)
}

export function destroyToastContainer() {
  container?.remove()
  container = null
}
