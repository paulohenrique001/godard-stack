import { cn } from '../lib/cn'
import { parseIconValue } from './icon-value'

type IconDisplayProps = {
  value: string
  className?: string
  iconClassName?: string
}

export function IconDisplay({ value, className, iconClassName }: IconDisplayProps) {
  const parsed = parseIconValue(value ?? '')

  if (parsed.type === 'lucide') {
    const Icon = parsed.icon
    return (
      <span className={cn('inline-flex items-center justify-center', className)}>
        <Icon className={cn('size-[1em]', iconClassName)} style={{ color: parsed.color }} />
      </span>
    )
  }

  return (
    <span className={cn('inline-flex items-center justify-center leading-none', className)}>
      {parsed.emoji}
    </span>
  )
}
