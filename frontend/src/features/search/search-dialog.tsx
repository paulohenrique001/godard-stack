import {
  Fragment,
  useEffect,
  useMemo,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react'
import type { IconType } from 'react-icons'
import { LuSearch, LuStar, LuX } from 'react-icons/lu'
import { useModalDialog } from '../accessibility/use-modal-dialog'
import { cn } from '../../shared/lib/cn'

const SEARCH_HISTORY_KEY = 'godard-stack.search-history'

export type SearchItem = {
  id: string
  title: string
  icon: IconType
  section: string
  run: () => void
}

type SearchHistory = {
  favorites: string[]
  recents: string[]
}

type SearchDialogProps = {
  open: boolean
  items: SearchItem[]
  onClose: () => void
}

export function SearchDialog({ open, items, onClose }: SearchDialogProps) {
  const [query, setQuery] = useState('')
  const [history, setHistory] = useState<SearchHistory>(readSearchHistory)
  const [activeIndex, setActiveIndex] = useState(0)
  const dialogRef = useModalDialog(open, onClose)

  useEffect(() => {
    if (!open) {
      setQuery('')
      return
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  const updateHistory = (next: SearchHistory) => {
    setHistory(next)
    storeSearchHistory(next)
  }

  const addRecent = (itemId: string) => {
    if (history.favorites.includes(itemId)) {
      return
    }
    updateHistory({
      ...history,
      recents: [itemId, ...history.recents.filter((id) => id !== itemId)].slice(0, 10),
    })
  }

  const addFavorite = (itemId: string) =>
    updateHistory({
      favorites: [...history.favorites.filter((id) => id !== itemId), itemId],
      recents: history.recents.filter((id) => id !== itemId),
    })
  const removeFavorite = (itemId: string) =>
    updateHistory({ ...history, favorites: history.favorites.filter((id) => id !== itemId) })
  const removeRecent = (itemId: string) =>
    updateHistory({ ...history, recents: history.recents.filter((id) => id !== itemId) })
  const select = (item: SearchItem) => {
    addRecent(item.id)
    onClose()
    item.run()
  }

  const matches = useMemo(
    () => items.filter((item) => normalize(item.title).includes(normalize(query))),
    [items, query],
  )
  const sections = useMemo(() => [...new Set(matches.map((item) => item.section))], [matches])
  const resolve = (ids: string[]) => ids.flatMap((id) => items.filter((item) => item.id === id))
  const keyboardItems = query
    ? matches
    : [...resolve(history.favorites), ...resolve(history.recents)]

  useEffect(() => {
    setActiveIndex(0)
  }, [open, query])

  const navigateResults = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (keyboardItems.length === 0) {
      return
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveIndex((current) => (current + 1) % keyboardItems.length)
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex((current) => (current - 1 + keyboardItems.length) % keyboardItems.length)
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      select(keyboardItems[activeIndex] ?? keyboardItems[0])
    }
  }

  if (!open) {
    return null
  }

  const activeId = keyboardItems[activeIndex]?.id
  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 p-6 pt-[15vh] backdrop-blur-[2px]"
      role="presentation"
      onMouseDown={onClose}
    >
      <section
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="Pesquisar"
        className="animate-in fade-in zoom-in-95 mx-auto w-full max-w-xl overflow-hidden rounded-2xl border bg-popover shadow-2xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <SearchInput query={query} onQueryChange={setQuery} onKeyDown={navigateResults} />
        <div className="h-96 max-h-[60vh] overflow-y-auto p-2">
          {query && matches.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">Nenhum resultado</p>
          )}
          {query &&
            sections.map((section) => (
              <SearchSection
                key={section}
                title={section}
                query={query}
                items={matches.filter((item) => item.section === section)}
                activeId={activeId}
                onSelect={select}
              />
            ))}
          {!query && history.favorites.length === 0 && history.recents.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Seus favoritos e recentes aparecem aqui
            </p>
          )}
          {!query && history.favorites.length > 0 && (
            <SearchHistorySection
              title="Favoritos"
              items={resolve(history.favorites)}
              activeId={activeId}
              icon={LuStar}
              actionLabel="Remover dos favoritos"
              actionIcon={LuX}
              onSelect={select}
              onAction={removeFavorite}
            />
          )}
          {!query && history.recents.length > 0 && (
            <SearchHistorySection
              title="Recentes"
              items={resolve(history.recents)}
              activeId={activeId}
              actionLabel="Favoritar"
              actionIcon={LuStar}
              secondaryActionLabel="Remover dos recentes"
              secondaryActionIcon={LuX}
              onSelect={select}
              onAction={addFavorite}
              onSecondaryAction={removeRecent}
            />
          )}
        </div>
      </section>
    </div>
  )
}

function SearchInput({
  query,
  onQueryChange,
  onKeyDown,
}: {
  query: string
  onQueryChange: (query: string) => void
  onKeyDown: (event: ReactKeyboardEvent<HTMLInputElement>) => void
}) {
  return (
    <div className="relative border-b">
      <LuSearch className="pointer-events-none absolute top-4 left-3 size-5 text-muted-foreground" />
      <input
        data-dialog-initial-focus
        autoFocus
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
        onKeyDown={onKeyDown}
        placeholder="Pesquisar"
        className="h-12 w-full bg-transparent py-3 pr-10 pl-10 text-sm outline-none placeholder:text-muted-foreground"
      />
      {query && (
        <button
          type="button"
          aria-label="Limpar pesquisa"
          className="absolute top-3 right-3 text-muted-foreground"
          onClick={() => onQueryChange('')}
        >
          <LuX className="size-4" />
        </button>
      )}
    </div>
  )
}

function SearchSection({
  title,
  query,
  items,
  activeId,
  onSelect,
}: {
  title: string
  query: string
  items: SearchItem[]
  activeId?: string
  onSelect: (item: SearchItem) => void
}) {
  return (
    <section className="mb-2">
      <p className="px-2 py-1.5 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
        {title}
      </p>
      {items.map((item) => {
        const Icon = item.icon
        const selected = activeId === item.id
        return (
          <button
            type="button"
            key={item.id}
            className={cn(
              'group flex h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-sm transition-colors hover:bg-primary hover:text-primary-foreground',
              selected && 'bg-primary text-primary-foreground',
            )}
            onClick={() => onSelect(item)}
          >
            <Icon className="size-5" />
            <span className="flex-1 truncate">
              <SearchHighlight text={item.title} query={query} selected={selected} />
            </span>
          </button>
        )
      })}
    </section>
  )
}

function SearchHistorySection({
  title,
  items,
  activeId,
  icon: FixedIcon,
  actionLabel,
  actionIcon: ActionIcon,
  secondaryActionLabel,
  secondaryActionIcon: SecondaryActionIcon,
  onSelect,
  onAction,
  onSecondaryAction,
}: {
  title: string
  items: SearchItem[]
  activeId?: string
  icon?: IconType
  actionLabel: string
  actionIcon: IconType
  secondaryActionLabel?: string
  secondaryActionIcon?: IconType
  onSelect: (item: SearchItem) => void
  onAction: (id: string) => void
  onSecondaryAction?: (id: string) => void
}) {
  return (
    <section className="mb-2">
      <p className="px-2 py-1.5 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
        {title}
      </p>
      {items.map((item) => {
        const Icon = FixedIcon ?? item.icon
        return (
          <div
            key={item.id}
            className={cn(
              'group flex h-11 items-center gap-3 rounded-lg px-3 text-sm transition-colors hover:bg-primary hover:text-primary-foreground',
              activeId === item.id && 'bg-primary text-primary-foreground',
            )}
          >
            <button
              type="button"
              className="flex min-w-0 flex-1 items-center gap-3 text-left"
              onClick={() => onSelect(item)}
            >
              <Icon className="size-5 shrink-0" />
              <span className="truncate">{item.title}</span>
            </button>
            <button
              type="button"
              tabIndex={-1}
              aria-label={actionLabel}
              className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-foreground/10 group-hover:text-current"
              onClick={() => onAction(item.id)}
            >
              <ActionIcon className="size-4" />
            </button>
            {secondaryActionLabel && SecondaryActionIcon && onSecondaryAction && (
              <button
                type="button"
                tabIndex={-1}
                aria-label={secondaryActionLabel}
                className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-foreground/10 group-hover:text-current"
                onClick={() => onSecondaryAction(item.id)}
              >
                <SecondaryActionIcon className="size-4" />
              </button>
            )}
          </div>
        )
      })}
    </section>
  )
}

function SearchHighlight({
  text,
  query,
  selected,
}: {
  text: string
  query: string
  selected: boolean
}) {
  const term = normalize(query.trim())
  const normalized = normalize(text)
  const start = term ? normalized.indexOf(term) : -1
  if (start < 0) {
    return text
  }
  const end = start + term.length
  return (
    <Fragment>
      {text.slice(0, start)}
      <span className={cn('text-highlight', selected && 'text-primary-foreground underline')}>
        {text.slice(start, end)}
      </span>
      {text.slice(end)}
    </Fragment>
  )
}

function normalize(value: string) {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('pt-BR')
}

function readSearchHistory(): SearchHistory {
  try {
    const parsed = JSON.parse(
      localStorage.getItem(SEARCH_HISTORY_KEY) ?? '{}',
    ) as Partial<SearchHistory>
    return {
      favorites: Array.isArray(parsed.favorites) ? parsed.favorites : [],
      recents: Array.isArray(parsed.recents) ? parsed.recents : [],
    }
  } catch {
    return { favorites: [], recents: [] }
  }
}

function storeSearchHistory(history: SearchHistory) {
  try {
    localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(history))
  } catch {
    return
  }
}
