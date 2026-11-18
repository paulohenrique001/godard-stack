import { useState, type MouseEvent, type ReactNode } from 'react'
import { LuStar, LuX } from 'react-icons/lu'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { filterSearchItems, type SearchItem } from '@/features/search/search-catalog'
import { SearchHighlight } from '@/features/search/search-highlight'
import { useSearchHistory } from '@/features/search/use-search-history'

const GROUP_CLASS = '[&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group-heading]]:uppercase'
const ITEM_CLASS = 'group h-11 gap-3 rounded-lg px-3 transition-colors data-[selected=true]:bg-primary data-[selected=true]:text-primary-foreground'

function ItemAction({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  const click = (event: MouseEvent) => {
    event.stopPropagation()
    onClick()
  }

  return (
    <button
      type="button"
      tabIndex={-1}
      aria-label={label}
      className="flex size-7 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors group-data-[selected=true]:text-primary-foreground hover:bg-foreground/10"
      onClick={click}
    >
      {children}
    </button>
  )
}

type SearchDialogProps = {
  open: boolean
  items: SearchItem[]
  onOpenChange: (open: boolean) => void
  onClosed: () => void
}

export function SearchDialog({ open, items, onOpenChange, onClosed }: SearchDialogProps) {
  const [query, setQuery] = useState('')
  const { history, addFavorite, removeFavorite, addRecent, removeRecent } = useSearchHistory()

  const close = (nextOpen: boolean) => {
    onOpenChange(nextOpen)
    if (!nextOpen) {
      setQuery('')
    }
  }

  const select = (item: SearchItem) => {
    addRecent(item.id)
    close(false)
    item.run()
  }

  const resolve = (ids: string[]) =>
    ids.flatMap((id) => items.filter((item) => item.id === id))

  const results = filterSearchItems(items, query)
  const sections = [...new Set(results.map((item) => item.section))]

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent
        showCloseButton={false}
        className="top-[15%] translate-y-0 gap-0 overflow-hidden rounded-2xl p-0 shadow-2xl sm:max-w-xl"
        onCloseAutoFocus={(event) => {
          event.preventDefault()
          onClosed()
        }}
      >
        <DialogTitle className="sr-only">Pesquisar</DialogTitle>
        <DialogDescription className="sr-only">Pesquise páginas e ações da aplicação</DialogDescription>
        <Command shouldFilter={false} className="rounded-none">
          <div className="relative">
            <CommandInput placeholder="Pesquisar" value={query} onValueChange={setQuery} />
            {query && (
              <button
                type="button"
                aria-label="Limpar pesquisa"
                className="absolute top-1/2 right-3 -translate-y-1/2 cursor-pointer text-muted-foreground"
                onClick={() => setQuery('')}
              >
                <LuX className="size-4" />
              </button>
            )}
          </div>
          <CommandList className="h-96 max-h-[60vh] p-2">
            <CommandEmpty>
              {query ? 'Nenhum resultado' : 'Seus favoritos e recentes aparecem aqui'}
            </CommandEmpty>
            {query ? (
              sections.map((section) => (
                <CommandGroup key={section} heading={section} className={GROUP_CLASS}>
                  {results
                    .filter((item) => item.section === section)
                    .map((item) => (
                      <CommandItem key={item.id} value={item.id} className={ITEM_CLASS} onSelect={() => select(item)}>
                        <item.icon className="size-5 text-current" />
                        <span className="flex-1 truncate">
                          <SearchHighlight text={item.title} query={query} />
                        </span>
                      </CommandItem>
                    ))}
                </CommandGroup>
              ))
            ) : (
              <>
                {history.favorites.length > 0 && (
                  <CommandGroup heading="Favoritos" className={GROUP_CLASS}>
                    {resolve(history.favorites).map((item) => (
                      <CommandItem key={item.id} value={item.id} className={ITEM_CLASS} onSelect={() => select(item)}>
                        <LuStar className="size-5 text-current" />
                        <span className="flex-1 truncate">{item.title}</span>
                        <ItemAction label="Remover dos favoritos" onClick={() => removeFavorite(item.id)}>
                          <LuX className="size-4" />
                        </ItemAction>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}
                {history.recents.length > 0 && (
                  <CommandGroup heading="Recentes" className={GROUP_CLASS}>
                    {resolve(history.recents).map((item) => (
                      <CommandItem key={item.id} value={item.id} className={ITEM_CLASS} onSelect={() => select(item)}>
                        <item.icon className="size-5 text-current" />
                        <span className="flex-1 truncate">{item.title}</span>
                        <ItemAction label="Favoritar" onClick={() => addFavorite(item.id)}>
                          <LuStar className="size-4" />
                        </ItemAction>
                        <ItemAction label="Remover dos recentes" onClick={() => removeRecent(item.id)}>
                          <LuX className="size-4" />
                        </ItemAction>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}
              </>
            )}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  )
}
