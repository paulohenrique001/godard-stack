import { useRef, type KeyboardEvent } from 'react'
import { cn } from '@/lib/utils'

type InlineInputProps = {
  value: string
  label: string
  maxLength: number
  className?: string
  onCommit: (value: string) => void
  onCancel: () => void
}

export function InlineInput({ value, label, maxLength, className, onCommit, onCancel }: InlineInputProps) {
  const finished = useRef(false)

  const commit = (text: string) => {
    if (finished.current) {
      return
    }
    finished.current = true
    const next = text.trim()
    if (next && next !== value) {
      onCommit(next)
    } else {
      onCancel()
    }
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      commit(event.currentTarget.value)
    } else if (event.key === 'Escape') {
      finished.current = true
      onCancel()
    }
  }

  return (
    <input
      autoFocus
      aria-label={label}
      defaultValue={value}
      maxLength={maxLength}
      className={cn(
        'min-w-0 flex-1 bg-transparent outline-none selection:bg-primary selection:text-primary-foreground',
        className,
      )}
      onFocus={(event) => event.currentTarget.select()}
      onBlur={(event) => commit(event.currentTarget.value)}
      onKeyDown={onKeyDown}
    />
  )
}
