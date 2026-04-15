/** Injects the panel's base CSS into <head>. Idempotent. */
let injected = false

export function injectStyles() {
  if (injected) return
  injected = true

  const style = document.createElement('style')
  style.id = 'devlens-styles'
  style.textContent = /* css */ `
    .devlens {
      --dl-bg: #1a1a2e;
      --dl-bg-secondary: #16213e;
      --dl-border: #0f3460;
      --dl-text: #e0e0e0;
      --dl-text-muted: #8a8a9a;
      --dl-accent: #e94560;
      --dl-radius: 8px;
      --dl-font: ui-monospace, 'SF Mono', 'Cascadia Code', 'Segoe UI Mono', monospace;

      position: fixed;
      z-index: 999999;
      font-family: var(--dl-font);
      font-size: 13px;
      color: var(--dl-text);
      line-height: 1.5;
    }

    .devlens--bottom-right { bottom: 16px; right: 16px; }
    .devlens--bottom-left { bottom: 16px; left: 16px; }
    .devlens--top-right { top: 16px; right: 16px; }
    .devlens--top-left { top: 16px; left: 16px; }

    .devlens__toggle {
      width: 42px;
      height: 42px;
      border-radius: 50%;
      border: 2px solid var(--dl-border);
      background: var(--dl-bg);
      color: var(--dl-text);
      font-size: 18px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s ease;
      box-shadow: 0 2px 12px rgba(0, 0, 0, 0.3);
    }

    .devlens__toggle:hover,
    .devlens__toggle--active {
      border-color: var(--dl-accent);
      box-shadow: 0 2px 16px rgba(233, 69, 96, 0.3);
    }

    .devlens__container {
      display: none;
      position: absolute;
      bottom: 52px;
      right: 0;
      width: 420px;
      max-height: 500px;
      background: var(--dl-bg);
      border: 1px solid var(--dl-border);
      border-radius: var(--dl-radius);
      overflow: hidden;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
    }

    .devlens--top-right .devlens__container,
    .devlens--top-left .devlens__container {
      bottom: auto;
      top: 52px;
    }

    .devlens--bottom-left .devlens__container,
    .devlens--top-left .devlens__container {
      right: auto;
      left: 0;
    }

    .devlens__container--open {
      display: flex;
      flex-direction: column;
    }

    .devlens__nav {
      display: flex;
      gap: 2px;
      padding: 6px;
      background: var(--dl-bg-secondary);
      border-bottom: 1px solid var(--dl-border);
      overflow-x: auto;
      flex-shrink: 0;
    }

    .devlens__nav-item {
      padding: 6px 12px;
      border: none;
      background: transparent;
      color: var(--dl-text-muted);
      font-family: var(--dl-font);
      font-size: 12px;
      cursor: pointer;
      border-radius: 4px;
      white-space: nowrap;
      transition: all 0.15s ease;
    }

    .devlens__nav-item:hover {
      background: var(--dl-bg);
      color: var(--dl-text);
    }

    .devlens__nav-item--active {
      background: var(--dl-bg);
      color: var(--dl-accent);
    }

    .devlens__content {
      padding: 12px;
      overflow-y: auto;
      flex: 1;
      min-height: 100px;
      max-height: 440px;
    }

    .devlens__content::-webkit-scrollbar {
      width: 6px;
    }

    .devlens__content::-webkit-scrollbar-track {
      background: transparent;
    }

    .devlens__content::-webkit-scrollbar-thumb {
      background: var(--dl-border);
      border-radius: 3px;
    }
  `
  document.head.append(style)
}
