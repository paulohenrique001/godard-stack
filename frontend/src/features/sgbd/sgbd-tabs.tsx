import { useEffect, useRef, useState } from 'react'
import { LuCheck, LuDatabase, LuPlus, LuSquareCode, LuX } from 'react-icons/lu'
import { DRIVERS, type SgbdKind } from '@/features/sgbd/sgbd-drivers'
import type { QueryConsole, SgbdTab, SgbdWorkspace } from '@/features/sgbd/use-sgbd'
import { InlineInput } from '@/features/terminal/inline-input'
import { cn } from '@/lib/utils'

const MAX_CONSOLE_NAME_LENGTH = 40
export const TAB_CLASS = 'flex shrink-0 items-center gap-1.5 border-b-2 text-sm font-medium transition-colors'

export const tabColors = (active: boolean) =>
  active ? 'border-highlight text-highlight' : 'border-transparent text-muted-foreground'

type ConsoleTabProps = {
  item: QueryConsole
  active: boolean
  onSelect: () => void
  onClose: () => void
  onRename: (label: string) => void
}

function ConsoleTab({ item, active, onSelect, onClose, onRename }: ConsoleTabProps) {
  const [editing, setEditing] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const closeButton = useRef<HTMLButtonElement | null>(null)

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

  return (
    <div
      data-console-tab={item.id}
      className={cn(TAB_CLASS, 'w-56', tabColors(active))}
    >
      {editing ? (
        <div className="flex min-w-0 flex-1 items-center gap-1.5 py-2 pl-3">
          <LuSquareCode className="size-4 shrink-0" />
          <InlineInput
            value={item.label}
            label="Nome do console"
            maxLength={MAX_CONSOLE_NAME_LENGTH}
            className="rounded-sm"
            onCommit={(label) => {
              onRename(label)
              setEditing(false)
            }}
            onCancel={() => setEditing(false)}
          />
        </div>
      ) : (
        <button
          type="button"
          role="tab"
          aria-selected={active}
          className="flex min-w-0 flex-1 items-center gap-1.5 py-2 pl-3"
          onClick={onSelect}
          onDoubleClick={() => setEditing(true)}
        >
          <LuSquareCode className="size-4 shrink-0" />
          <span className="truncate">{item.label}</span>
        </button>
      )}
      <button
        ref={closeButton}
        type="button"
        aria-label={confirming ? `Confirmar fechar ${item.label}` : `Fechar ${item.label}`}
        className={cn(
          'mr-1 ml-2 flex size-5 shrink-0 items-center justify-center rounded-sm hover:bg-muted',
          confirming && 'text-destructive',
        )}
        onClick={() => (confirming ? onClose() : setConfirming(true))}
      >
        {confirming ? <LuCheck className="size-3.5" /> : <LuX className="size-3.5" />}
      </button>
    </div>
  )
}

type SgbdTabsProps = {
  kind: SgbdKind
  workspace: SgbdWorkspace
  onSelect: (tab: SgbdTab) => void
  onClose: (consoleId: number) => void
  onRename: (consoleId: number, label: string) => void
  onAdd: () => void
}

export function SgbdTabs({ kind, workspace, onSelect, onClose, onRename, onAdd }: SgbdTabsProps) {
  const { consoles, activeTab } = workspace
  const scrollArea = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    scrollArea.current
      ?.querySelector(`[data-console-tab="${activeTab}"]`)
      ?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [activeTab, consoles.length])

  return (
    <div className="flex items-center gap-1 border-b">
      <button
        type="button"
        role="tab"
        aria-selected={activeTab === 'schemas'}
        className={cn(TAB_CLASS, 'px-3 py-2', tabColors(activeTab === 'schemas'))}
        onClick={() => onSelect('schemas')}
      >
        <LuDatabase className="size-4" />
        {DRIVERS[kind].schemasLabel}
      </button>
      <span aria-hidden="true" className="mx-1 h-5 w-px shrink-0 bg-border" />
      <div
        ref={scrollArea}
        className="flex min-w-0 items-center gap-1 overflow-x-auto overflow-y-hidden [scrollbar-width:none]"
        onWheel={(event) => {
          event.currentTarget.scrollLeft += event.deltaY + event.deltaX
        }}
      >
        {consoles.map((item) => (
          <ConsoleTab
            key={item.id}
            item={item}
            active={activeTab === item.id}
            onSelect={() => onSelect(item.id)}
            onClose={() => onClose(item.id)}
            onRename={(label) => onRename(item.id, label)}
          />
        ))}
      </div>
      <button
        type="button"
        aria-label="Novo console"
        title="Novo console"
        className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        onClick={onAdd}
      >
        <LuPlus className="size-4" />
      </button>
    </div>
  )
}
