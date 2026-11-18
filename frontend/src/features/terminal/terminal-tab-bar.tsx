import { type KeyboardEvent as ReactKeyboardEvent, useEffect, useRef, useState } from 'react'
import { LuCheck, LuDot, LuSquareTerminal, LuX } from 'react-icons/lu'
import { InlineInput } from './inline-input'
import { MAX_TAB_NAME_LENGTH, tabTitle } from './use-terminal-tabs'
import type { TerminalTab } from './types'
import { cn } from '../../shared/lib/cn'

type TerminalTabItemProps = {
  tab: TerminalTab
  closable: boolean
  onSelect: () => void
  onClose: () => void
  onRename: (name: string) => void
  onEditEnd: () => void
  onKeyDown: (event: ReactKeyboardEvent<HTMLButtonElement>) => void
}

function TerminalTabItem({
  tab,
  closable,
  onSelect,
  onClose,
  onRename,
  onEditEnd,
  onKeyDown,
}: TerminalTabItemProps) {
  const [editing, setEditing] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const closeButton = useRef<HTMLButtonElement | null>(null)
  const title = tabTitle(tab)
  const terminalIcon = <LuSquareTerminal className="size-3.5 shrink-0" />

  useEffect(() => {
    if (!confirming) {
      return
    }
    const cancelOutside = (event: PointerEvent) => {
      if (!closeButton.current?.contains(event.target as Node)) {
        setConfirming(false)
      }
    }
    document.addEventListener('pointerdown', cancelOutside)
    return () => document.removeEventListener('pointerdown', cancelOutside)
  }, [confirming])

  const finishEditing = () => {
    setEditing(false)
    onEditEnd()
  }

  return (
    <div
      className={cn(
        'animate-in fade-in flex h-10 w-48 shrink-0 items-center border-b-2 transition-colors duration-200',
        tab.active
          ? 'border-highlight text-highlight'
          : 'border-transparent text-muted-foreground hover:text-foreground',
      )}
    >
      {editing ? (
        <div className="flex h-full min-w-0 flex-1 items-center gap-2 px-3">
          {terminalIcon}
          <InlineInput
            value={title}
            label="Nome do console"
            maxLength={MAX_TAB_NAME_LENGTH}
            className="h-6 rounded-sm text-sm font-medium"
            onCommit={(name) => {
              onRename(name)
              finishEditing()
            }}
            onCancel={finishEditing}
          />
        </div>
      ) : (
        <button
          id={`terminal-tab-${tab.id}`}
          type="button"
          role="tab"
          aria-selected={tab.active}
          aria-controls={`terminal-panel-${tab.id}`}
          tabIndex={tab.active ? 0 : -1}
          className="flex h-full min-w-0 flex-1 items-center gap-2 px-3 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          onClick={onSelect}
          onKeyDown={onKeyDown}
          onDoubleClick={() => setEditing(true)}
        >
          {terminalIcon}
          <span className="truncate">{title}</span>
        </button>
      )}
      {closable ? (
        <button
          ref={closeButton}
          type="button"
          aria-label={confirming ? `Confirmar fechar ${title}` : `Fechar ${title}`}
          className={cn(
            'mr-1.5 flex size-6 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-foreground/10',
            !tab.active && 'hover:text-foreground',
            confirming && 'text-destructive',
          )}
          onClick={() => (confirming ? onClose() : setConfirming(true))}
        >
          {confirming ? <LuCheck className="size-3.5" /> : <LuX className="size-3.5" />}
        </button>
      ) : (
        <span
          aria-hidden="true"
          className="mr-1.5 flex size-6 shrink-0 items-center justify-center text-muted-foreground"
        >
          <LuDot className="size-5" />
        </span>
      )}
    </div>
  )
}

type TerminalTabBarProps = {
  tabs: TerminalTab[]
  onSelect: (id: number) => void
  onClose: (id: number) => void
  onRename: (id: number, name: string) => void
  onEditEnd: () => void
}

export function TerminalTabBar({
  tabs,
  onSelect,
  onClose,
  onRename,
  onEditEnd,
}: TerminalTabBarProps) {
  const moveFocus = (event: ReactKeyboardEvent<HTMLButtonElement>, currentId: number) => {
    const keys = ['ArrowLeft', 'ArrowRight', 'Home', 'End']
    if (!keys.includes(event.key)) return
    event.preventDefault()
    const current = tabs.findIndex((tab) => tab.id === currentId)
    const nextIndex =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? tabs.length - 1
          : (current + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length
    const next = tabs[nextIndex]
    onSelect(next.id)
    window.requestAnimationFrame(() => document.getElementById(`terminal-tab-${next.id}`)?.focus())
  }
  return (
    <div
      role="tablist"
      aria-label="Sessões do console"
      aria-orientation="horizontal"
      className="flex min-w-0 items-center gap-1 overflow-x-auto overflow-y-hidden border-b [scrollbar-width:none]"
      onWheel={(event) => {
        event.currentTarget.scrollLeft += event.deltaY + event.deltaX
      }}
    >
      {tabs.map((tab) => (
        <TerminalTabItem
          key={tab.id}
          tab={tab}
          closable={tabs.length > 1}
          onSelect={() => onSelect(tab.id)}
          onClose={() => onClose(tab.id)}
          onRename={(name) => onRename(tab.id, name)}
          onEditEnd={onEditEnd}
          onKeyDown={(event) => moveFocus(event, tab.id)}
        />
      ))}
    </div>
  )
}
