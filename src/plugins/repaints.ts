/**
 * Repaints plugin — uses a MutationObserver + canvas overlay to highlight
 * elements that mutate frequently. Color ramps from teal (x1–2) to red
 * (x15+) so "hot" DOM zones are obvious at a glance.
 */
import type { DevLensPlugin } from '../types.js'

interface HotSpot {
  count: number
  lastTime: number
  fadeTimer: ReturnType<typeof setTimeout> | null
}

const STORAGE_KEY = 'devlens:repaints'
const BASE_FADE = 800
const MAX_FADE = 6000
const CANVAS_ID = 'devlens-repaints-canvas'
const COLORS = [
  'rgba(78, 205, 196, 0.25)',   // x1-2: teal
  'rgba(255, 209, 102, 0.30)',  // x3-5: yellow
  'rgba(255, 150, 50, 0.35)',   // x6-14: orange
  'rgba(233, 69, 96, 0.45)',    // x15+: red
]
const BORDER_COLORS = [
  'rgba(78, 205, 196, 0.8)',
  'rgba(255, 209, 102, 0.8)',
  'rgba(255, 150, 50, 0.9)',
  'rgba(233, 69, 96, 1)',
]

function getFadeDelay(count: number): number {
  // x1 = 800ms, x5 = ~2s, x15 = ~4s, x30+ = 6s cap
  return Math.min(BASE_FADE + count * 180, MAX_FADE)
}

function getColorIndex(count: number): number {
  if (count <= 2) return 0
  if (count <= 5) return 1
  if (count <= 14) return 2
  return 3
}

function createOverlay(): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.id = CANVAS_ID
  canvas.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;pointer-events:none;z-index:999998;'
  canvas.width = window.innerWidth * devicePixelRatio
  canvas.height = window.innerHeight * devicePixelRatio
  document.body.append(canvas)
  return canvas
}

function loadActive(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

function saveActive(v: boolean) {
  try {
    localStorage.setItem(STORAGE_KEY, v ? '1' : '0')
  } catch {}
}

export function repaintsPlugin(): DevLensPlugin {
  let active = loadActive()
  let canvas: HTMLCanvasElement | null = null
  let ctx: CanvasRenderingContext2D | null = null
  let observer: MutationObserver | null = null
  let resizeHandler: (() => void) | null = null
  let rafId: number | null = null

  const spots = new WeakMap<Element, HotSpot>()
  const trackedElements = new Set<Element>()

  function resizeCanvas() {
    if (!canvas) return
    canvas.width = window.innerWidth * devicePixelRatio
    canvas.height = window.innerHeight * devicePixelRatio
  }

  function draw() {
    if (!ctx || !canvas) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    const ratio = devicePixelRatio
    const now = Date.now()

    for (const el of trackedElements) {
      const spot = spots.get(el)
      if (!spot) continue

      const fade = getFadeDelay(spot.count)
      const elapsed = now - spot.lastTime
      if (elapsed > fade) continue

      const rect = el.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) continue

      const opacity = Math.max(0, 1 - elapsed / fade)
      const ci = getColorIndex(spot.count)

      ctx.globalAlpha = opacity
      ctx.fillStyle = COLORS[ci]
      ctx.fillRect(rect.x * ratio, rect.y * ratio, rect.width * ratio, rect.height * ratio)

      ctx.strokeStyle = BORDER_COLORS[ci]
      ctx.lineWidth = 1.5 * ratio
      ctx.strokeRect(rect.x * ratio, rect.y * ratio, rect.width * ratio, rect.height * ratio)

      // Count badge
      if (spot.count > 1) {
        const label = `x${spot.count}`
        const fontSize = 10 * ratio
        ctx.font = `bold ${fontSize}px ui-monospace, monospace`
        const metrics = ctx.measureText(label)
        const badgeW = metrics.width + 6 * ratio
        const badgeH = fontSize + 4 * ratio
        const bx = (rect.x + rect.width) * ratio - badgeW
        const by = rect.y * ratio

        ctx.globalAlpha = opacity * 0.9
        ctx.fillStyle = BORDER_COLORS[ci]
        ctx.beginPath()
        ctx.roundRect(bx, by, badgeW, badgeH, 3 * ratio)
        ctx.fill()

        ctx.fillStyle = '#fff'
        ctx.globalAlpha = opacity
        ctx.fillText(label, bx + 3 * ratio, by + fontSize)
      }
    }

    ctx.globalAlpha = 1
    rafId = requestAnimationFrame(draw)
  }

  function handleMutations(mutations: MutationRecord[]) {
    const now = Date.now()

    for (const mutation of mutations) {
      const target = mutation.target instanceof Element
        ? mutation.target
        : mutation.target.parentElement

      if (!target || target.closest('#devlens') || target.id === CANVAS_ID || target.closest('[data-devlens]')) continue

      // Skip childList mutations where all added/removed nodes are devlens-internal
      if (mutation.type === 'childList') {
        const nodes = [...mutation.addedNodes, ...mutation.removedNodes]
        const allDevlens = nodes.length > 0 && nodes.every((n) =>
          n instanceof Element && (n.hasAttribute('data-devlens') || n.closest?.('[data-devlens]') || n.closest?.('#devlens') || n.id === CANVAS_ID),
        )
        if (allDevlens) continue
      }

      let spot = spots.get(target)
      if (!spot) {
        spot = { count: 0, lastTime: 0, fadeTimer: null }
        spots.set(target, spot)
        trackedElements.add(target)
      }

      spot.count++
      spot.lastTime = now

      if (spot.fadeTimer) clearTimeout(spot.fadeTimer)
      const resetDelay = getFadeDelay(spot.count) + 500
      spot.fadeTimer = setTimeout(() => {
        spot!.count = 0
        spot!.fadeTimer = null
      }, resetDelay)
    }
  }

  function start() {
    if (active) return
    active = true
    saveActive(true)

    canvas = createOverlay()
    ctx = canvas.getContext('2d')
    resizeHandler = () => resizeCanvas()
    window.addEventListener('resize', resizeHandler)

    observer = new MutationObserver(handleMutations)
    observer.observe(document.body, {
      childList: true,
      attributes: true,
      characterData: true,
      subtree: true,
      attributeFilter: ['class', 'style', 'src', 'href', 'data-*'],
    })

    rafId = requestAnimationFrame(draw)
  }

  function stop() {
    if (!active) return
    active = false
    saveActive(false)

    observer?.disconnect()
    observer = null

    if (rafId) cancelAnimationFrame(rafId)
    rafId = null

    if (resizeHandler) window.removeEventListener('resize', resizeHandler)
    resizeHandler = null

    canvas?.remove()
    canvas = null
    ctx = null

    trackedElements.clear()
  }

  // Auto-start if it was active before refresh
  if (active) {
    active = false // reset so start() doesn't bail
    start()
  }

  return {
    name: 'Repaints',
    icon: '🎨',

    panel() {
      const el = document.createElement('div')
      el.className = 'devlens-repaints'
      return el
    },

    onMount(container) {
      const root = container.querySelector('.devlens-repaints') as HTMLElement

      const render = () => {
        root.innerHTML = `
          <div style="margin-bottom:12px;">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
              <span style="font-size:12px;color:#8a8a9a;">Highlight DOM mutations live</span>
              <button id="devlens-repaints-toggle" style="
                padding:6px 16px;border:none;border-radius:4px;cursor:pointer;
                font-family:var(--dl-font);font-size:12px;font-weight:600;
                background:${active ? '#3a1a1a' : '#1a3a1a'};
                color:${active ? '#e94560' : '#4caf50'};
                border:1px solid ${active ? '#e94560' : '#4caf50'};
              ">${active ? 'Stop' : 'Start'}</button>
            </div>

            <div style="display:flex;flex-direction:column;gap:6px;font-size:12px;">
              <div style="display:flex;align-items:center;gap:8px;">
                <span style="display:inline-block;width:14px;height:14px;border-radius:3px;background:${COLORS[0]};border:1.5px solid ${BORDER_COLORS[0]}"></span>
                <span style="color:#8a8a9a;">x1–2 — normal</span>
              </div>
              <div style="display:flex;align-items:center;gap:8px;">
                <span style="display:inline-block;width:14px;height:14px;border-radius:3px;background:${COLORS[1]};border:1.5px solid ${BORDER_COLORS[1]}"></span>
                <span style="color:#8a8a9a;">x3–5 — frequent</span>
              </div>
              <div style="display:flex;align-items:center;gap:8px;">
                <span style="display:inline-block;width:14px;height:14px;border-radius:3px;background:${COLORS[2]};border:1.5px solid ${BORDER_COLORS[2]}"></span>
                <span style="color:#8a8a9a;">x6–14 — intensive</span>
              </div>
              <div style="display:flex;align-items:center;gap:8px;">
                <span style="display:inline-block;width:14px;height:14px;border-radius:3px;background:${COLORS[3]};border:1.5px solid ${BORDER_COLORS[3]}"></span>
                <span style="color:#8a8a9a;">x15+ — excessive, investigate</span>
              </div>
            </div>
          </div>

          ${active ? `
            <div style="padding:8px 10px;background:#1a2a3a;border-radius:4px;border-left:3px solid #4ea8de;font-size:12px;color:#8a8a9a;">
              Tracking <strong style="color:#e0e0e0">${trackedElements.size}</strong> elements — interact with the page to see highlights
            </div>
          ` : ''}
        `

        root.querySelector('#devlens-repaints-toggle')?.addEventListener('click', () => {
          if (active) stop()
          else start()
          render()
        })
      }

      render()
      if (active) {
        const interval = setInterval(() => {
          const counter = root.querySelector('strong')
          if (counter && active) counter.textContent = String(trackedElements.size)
        }, 1000)
        root.setAttribute('data-interval', String(interval))
      }
    },

    onUnmount() {
      // keep tracking active even when switching tabs
    },
  }
}
