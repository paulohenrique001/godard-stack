const KEY = 'godard.font-scale'
const SIZES = [13, 14, 16, 18, 20] as const
const DEFAULT_INDEX = 2

export const FONT_SCALE_COUNT = SIZES.length

function clamp(idx: number) {
  return Math.max(0, Math.min(SIZES.length - 1, idx))
}

export function loadFontScaleIndex(): number {
  try {
    const v = localStorage.getItem(KEY)
    if (v === null) return DEFAULT_INDEX
    const idx = Number(v)
    return Number.isInteger(idx) ? clamp(idx) : DEFAULT_INDEX
  } catch {
    return DEFAULT_INDEX
  }
}

export function applyFontScale(index: number): void {
  document.documentElement.style.fontSize = `${SIZES[clamp(index)]}px`
}

export function adjustFontScale(delta: 1 | -1): void {
  const next = clamp(loadFontScaleIndex() + delta)
  try { localStorage.setItem(KEY, String(next)) } catch {}
  applyFontScale(next)
}
