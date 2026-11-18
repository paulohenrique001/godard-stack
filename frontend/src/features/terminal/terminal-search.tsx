import { useState, type KeyboardEvent } from 'react'
import type { SearchAddon } from '@xterm/addon-search'
import { LuChevronDown, LuChevronUp, LuX } from 'react-icons/lu'

const BUTTON_CLASS =
  'flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground'

export function TerminalSearch({
  addon,
  label = 'Buscar no terminal',
  onClose,
}: {
  addon: SearchAddon
  label?: string
  onClose: () => void
}) {
  const [term, setTerm] = useState('')
  const findNext = () => term && addon.findNext(term)
  const findPrevious = () => term && addon.findPrevious(term)
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.shiftKey ? findPrevious() : findNext()
    } else if (event.key === 'Escape') {
      onClose()
    }
  }
  return (
    <div className="animate-in fade-in absolute top-2 right-4 z-10 flex items-center gap-1 rounded-lg border bg-popover p-1 shadow-md duration-100">
      <input
        autoFocus
        aria-label={label}
        placeholder="Buscar"
        value={term}
        className="h-6 w-44 bg-transparent px-1.5 text-sm outline-none"
        onChange={(event) => {
          setTerm(event.target.value)
          addon.findNext(event.target.value, { incremental: true })
        }}
        onKeyDown={onKeyDown}
      />
      <button
        type="button"
        aria-label="Resultado anterior"
        className={BUTTON_CLASS}
        onClick={findPrevious}
      >
        <LuChevronUp className="size-4" />
      </button>
      <button
        type="button"
        aria-label="Próximo resultado"
        className={BUTTON_CLASS}
        onClick={findNext}
      >
        <LuChevronDown className="size-4" />
      </button>
      <button type="button" aria-label="Fechar busca" className={BUTTON_CLASS} onClick={onClose}>
        <LuX className="size-3.5" />
      </button>
    </div>
  )
}
