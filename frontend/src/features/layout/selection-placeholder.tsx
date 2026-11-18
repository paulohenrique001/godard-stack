import { LuCircleAlert, LuInbox, LuMousePointerClick } from 'react-icons/lu'

const PLACEHOLDER_CLASS = 'animate-in fade-in flex h-full w-full items-center justify-center p-6 duration-200'
const ICON_CLASS = 'size-20'
const ICON_STROKE = 1.25

export function SelectionPlaceholder({ label }: { label: string }) {
  return (
    <div className={PLACEHOLDER_CLASS}>
      <LuMousePointerClick aria-label={label} className={`${ICON_CLASS} text-muted-foreground/40`} strokeWidth={ICON_STROKE} />
    </div>
  )
}

export function EmptyPlaceholder({ label }: { label: string }) {
  return (
    <div className={PLACEHOLDER_CLASS}>
      <LuInbox aria-label={label} className={`${ICON_CLASS} text-muted-foreground/40`} strokeWidth={ICON_STROKE} />
    </div>
  )
}

export function ErrorPlaceholder({ label }: { label: string }) {
  return (
    <div className={PLACEHOLDER_CLASS} title={label}>
      <LuCircleAlert aria-label={label} className={`${ICON_CLASS} text-destructive/50`} strokeWidth={ICON_STROKE} />
    </div>
  )
}
