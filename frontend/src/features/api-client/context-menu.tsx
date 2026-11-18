import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

export type ContextMenuSeparator = { separator: true }
export type ContextMenuEntry = {
  label: string
  icon?: ReactNode
  shortcut?: string
  disabled?: boolean
  danger?: boolean
  onClick: () => void
}
export type ContextMenuItem = ContextMenuEntry | ContextMenuSeparator

type ContextMenuProps = {
  x: number
  y: number
  items: ContextMenuItem[]
  onClose: () => void
}

export function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    const el = menuRef.current
    if (!el) return
    const { innerWidth, innerHeight } = window
    const { width, height } = el.getBoundingClientRect()
    if (x + width > innerWidth) el.style.left = `${innerWidth - width - 4}px`
    if (y + height > innerHeight) el.style.top = `${y - height}px`
  }, [x, y])

  return createPortal(
    <div
      className="fixed inset-0 z-50"
      onMouseDown={onClose}
      onContextMenu={(e) => { e.preventDefault(); onClose() }}
    >
      <div
        ref={menuRef}
        className="absolute min-w-44 overflow-hidden rounded-lg border bg-popover p-1 shadow-lg"
        style={{ left: x, top: y }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {items.map((item, i) =>
          'separator' in item ? (
            <div key={i} className="my-1 h-px bg-border" />
          ) : (
            <button
              key={i}
              type="button"
              disabled={item.disabled}
              className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-40 ${item.danger ? 'text-destructive hover:bg-destructive/10' : ''}`}
              onClick={() => { item.onClick(); onClose() }}
            >
              {item.icon != null && (
                <span className="flex size-4 shrink-0 items-center justify-center text-muted-foreground">
                  {item.icon}
                </span>
              )}
              <span className="flex-1 text-left">{item.label}</span>
              {item.shortcut != null && (
                <span className="shrink-0 text-xs text-muted-foreground">{item.shortcut}</span>
              )}
            </button>
          )
        )}
      </div>
    </div>,
    document.body,
  )
}

export type ContextMenuState = { x: number; y: number; items: ContextMenuItem[] } | null

export function openContextMenu(
  e: React.MouseEvent,
  items: ContextMenuItem[],
  setState: (s: ContextMenuState) => void,
) {
  e.preventDefault()
  e.stopPropagation()
  setState({ x: e.clientX, y: e.clientY, items })
}
