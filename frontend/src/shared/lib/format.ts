import type { IconType } from 'react-icons'
import { LuActivity, LuCirclePlay, LuLink, LuServer, LuSquareTerminal } from 'react-icons/lu'

const ACTIVITY_ICONS: Record<string, IconType> = {
  container: LuCirclePlay,
  connection: LuLink,
  console: LuSquareTerminal,
  command: LuSquareTerminal,
  system: LuServer,
}

export function formatBytes(value: number) {
  if (value <= 0) {
    return '—'
  }

  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1)
  return `${(value / 1024 ** index).toFixed(index > 1 ? 1 : 0)} ${units[index]}`
}

export function percentageUsed(total: number, available: number) {
  return total > 0 ? Math.max(0, Math.min(100, Math.round((1 - available / total) * 100))) : null
}

export function formatActivityTime(createdAt: string, includeDate = false) {
  const date = new Date(createdAt)
  if (Number.isNaN(date.getTime())) {
    return '—'
  }

  return new Intl.DateTimeFormat(
    'pt-BR',
    includeDate
      ? { dateStyle: 'short', timeStyle: 'short' }
      : { hour: '2-digit', minute: '2-digit' },
  ).format(date)
}

export function activityIcon(kind: string) {
  return ACTIVITY_ICONS[kind] ?? LuActivity
}

export function activityToneClass(tone: string) {
  if (tone === 'success') return 'bg-success/15 text-success'
  if (tone === 'warning') return 'bg-primary-soft text-warning'
  if (tone === 'muted') return 'bg-muted text-muted-foreground'
  return 'bg-primary-soft text-highlight'
}
