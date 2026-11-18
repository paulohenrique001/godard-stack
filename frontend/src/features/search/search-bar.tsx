import { useEffect, useState } from 'react'
import { LuSearch } from 'react-icons/lu'
import type { SearchItem } from '@/features/search/search-catalog'
import { SearchDialog } from '@/features/search/search-dialog'

type SearchBarProps = {
  items: SearchItem[]
  onClosed: () => void
}

function isInsideTerminal(target: EventTarget | null) {
  return target instanceof Element && target.closest('.xterm') !== null
}

export function SearchBar({ items, onClosed }: SearchBarProps) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const shortcut = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k'
      if (shortcut && !isInsideTerminal(event.target)) {
        event.preventDefault()
        setOpen((current) => !current)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  return (
    <>
      <button
        type="button"
        className="flex h-10 w-full cursor-pointer items-center gap-2.5 rounded-xl border border-transparent bg-muted px-3.5 text-sm text-muted-foreground transition-colors outline-none hover:border-border focus-visible:ring-2 focus-visible:ring-ring/50"
        onClick={() => setOpen(true)}
      >
        <LuSearch className="size-4 shrink-0" />
        <span className="flex-1 text-left">Pesquisar</span>
        <kbd className="flex gap-1 font-sans text-[11px] font-medium">
          <span className="rounded-md border bg-background px-1.5 py-0.5">Ctrl</span>
          <span className="rounded-md border bg-background px-1.5 py-0.5">K</span>
        </kbd>
      </button>
      <SearchDialog open={open} items={items} onOpenChange={setOpen} onClosed={onClosed} />
    </>
  )
}
