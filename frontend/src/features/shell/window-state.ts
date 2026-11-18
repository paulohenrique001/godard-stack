import { getCurrentWindow, LogicalPosition, LogicalSize } from '@tauri-apps/api/window'

const KEY = 'godard.window-state'

type Saved = { width: number; height: number; x: number; y: number; maximized: boolean }

function load(): Saved | null {
  try {
    const v = localStorage.getItem(KEY)
    return v ? (JSON.parse(v) as Saved) : null
  } catch {
    return null
  }
}

function save(state: Saved) {
  try { localStorage.setItem(KEY, JSON.stringify(state)) } catch {}
}

export async function restoreWindowState(): Promise<void> {
  if (!('__TAURI_INTERNALS__' in window)) return
  const saved = load()
  if (!saved) return
  const appWindow = getCurrentWindow()
  if (saved.maximized) {
    await appWindow.maximize()
  } else {
    await appWindow.setSize(new LogicalSize(saved.width, saved.height))
    if (typeof saved.x === 'number' && typeof saved.y === 'number') {
      await appWindow.setPosition(new LogicalPosition(saved.x, saved.y))
    }
  }
}

export function setupWindowStateTracking(): () => void {
  if (!('__TAURI_INTERNALS__' in window)) return () => {}
  const appWindow = getCurrentWindow()
  let saveTimer: number | undefined
  const unlisteners: Array<() => void> = []

  const persist = async () => {
    try {
      const isMaximized = await appWindow.isMaximized()
      if (isMaximized) {
        const existing = load()
        save({
          width: existing?.width ?? 1280,
          height: existing?.height ?? 800,
          x: existing?.x ?? 0,
          y: existing?.y ?? 0,
          maximized: true,
        })
      } else {
        const [size, pos, scale] = await Promise.all([
          appWindow.innerSize(),
          appWindow.outerPosition(),
          appWindow.scaleFactor(),
        ])
        save({
          width: Math.round(size.width / scale),
          height: Math.round(size.height / scale),
          x: Math.round(pos.x / scale),
          y: Math.round(pos.y / scale),
          maximized: false,
        })
      }
    } catch {}
  }

  const debounced = () => {
    clearTimeout(saveTimer)
    saveTimer = window.setTimeout(() => void persist(), 400)
  }

  void appWindow.listen('tauri://resize', debounced).then((fn) => unlisteners.push(fn))
  void appWindow.listen('tauri://move', debounced).then((fn) => unlisteners.push(fn))

  return () => {
    clearTimeout(saveTimer)
    unlisteners.forEach((fn) => fn())
  }
}
