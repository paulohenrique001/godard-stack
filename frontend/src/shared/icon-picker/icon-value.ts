import { DEFAULT_ICON_COLOR, LUCIDE_ICONS } from './icon-data'
import type { IconType } from 'react-icons'

export type ParsedIcon =
  | { type: 'emoji'; emoji: string }
  | { type: 'lucide'; icon: IconType; color: string }

export function parseIconValue(value: string | null | undefined): ParsedIcon {
  if (value && value.startsWith('@')) {
    const rest = value.slice(1)
    const colonIdx = rest.lastIndexOf(':')
    const name = colonIdx === -1 ? rest : rest.slice(0, colonIdx)
    const color = colonIdx === -1 ? DEFAULT_ICON_COLOR : rest.slice(colonIdx + 1)
    const entry = LUCIDE_ICONS.find((e) => e.name === name)
    if (entry) return { type: 'lucide', icon: entry.icon, color }
  }
  return { type: 'emoji', emoji: value || '📄' }
}

export function buildLucideIconValue(name: string, color: string): string {
  return `@${name}:${color}`
}
