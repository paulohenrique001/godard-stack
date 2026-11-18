import { useEffect, useState } from 'react'
import { LuArrowUp, LuFolder } from 'react-icons/lu'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { fetchFolders, type FolderListing } from '@/lib/api'

type FolderPickerProps = {
  initial: FolderListing
  onCancel: () => void
  onSelect: (listing: FolderListing) => void
}

const folderName = (parent: string, folder: string) => folder.slice(parent.length).replace(/^[\\/]/, '')

export function FolderPicker({ initial, onCancel, onSelect }: FolderPickerProps) {
  const [listing, setListing] = useState(initial)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetchFolders(initial.path)
      .then((current) => {
        if (!cancelled) {
          setListing(current)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setFailed(true)
        }
      })
    return () => {
      cancelled = true
    }
  }, [initial.path])

  const navigate = async (path: string) => {
    try {
      setListing(await fetchFolders(path))
      setFailed(false)
    } catch {
      setFailed(true)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="gap-3 sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Escolher destino</DialogTitle>
          <DialogDescription>A pasta de serviço será criada dentro da pasta selecionada.</DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Ir para a pasta acima"
            disabled={!listing.parent}
            onClick={() => navigate(listing.parent)}
          >
            <LuArrowUp />
          </Button>
          <p className="min-w-0 truncate text-sm font-medium" title={listing.path}>
            {listing.path}
          </p>
        </div>
        <ul className="h-64 overflow-y-auto rounded-lg border p-1">
          {listing.folders.map((folder) => (
            <li key={folder}>
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm hover:bg-muted"
                onClick={() => navigate(folder)}
              >
                <LuFolder className="size-4 shrink-0 text-muted-foreground" />
                <span className="truncate">{folderName(listing.path, folder)}</span>
              </button>
            </li>
          ))}
          {listing.folders.length === 0 && (
            <li className="px-2.5 py-2 text-sm text-muted-foreground">Nenhuma subpasta aqui.</li>
          )}
        </ul>
        {failed && (
          <p role="alert" className="text-sm text-destructive">
            Não foi possível abrir essa pasta.
          </p>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancelar
          </Button>
          <Button type="button" onClick={() => onSelect(listing)}>
            Selecionar pasta
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
