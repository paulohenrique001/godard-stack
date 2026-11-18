import { useCallback, useEffect, useState } from 'react'
import { LuCog, LuEye, LuLoaderCircle, LuPlus } from 'react-icons/lu'
import { Button } from '@/components/ui/button'
import { ContentLoader } from '@/components/ui/content-loader'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ConfirmDialog } from '@/features/docker/confirm-dialog'
import { ErrorPlaceholder } from '@/features/layout/selection-placeholder'
import { NewSchemaDialog } from '@/features/sgbd/new-schema-dialog'
import { dropSchema, fetchSchemas, refreshSchemas, type SchemaListing, type SchemaRow, type SgbdConnection } from '@/features/sgbd/sgbd-api'
import { DRIVERS, type SchemaDeletion } from '@/features/sgbd/sgbd-drivers'
import { cn } from '@/lib/utils'

const CARD_ICON_CLASS = 'size-[18px]'
const CARD_BUTTON_CLASS =
  'flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground'

type SchemaListProps = {
  connection: SgbdConnection
  connected: boolean
  onOpen: (schema: string) => void
  onCreated: () => void
}

const formatSyncedAt = (syncedAt: string) =>
  new Date(syncedAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })

type SchemaCardProps = {
  schema: SchemaRow
  deletion: SchemaDeletion
  deleting: boolean
  onOpen: () => void
  onDetails: () => void
  onDelete: () => void
}

function SchemaCard({ schema, deletion, deleting, onOpen, onDetails, onDelete }: SchemaCardProps) {
  const DeletionIcon = deletion.icon

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`Abrir console de ${schema.name}`}
      className="relative cursor-pointer rounded-xl border bg-card p-4 transition-colors outline-none hover:border-highlight focus-visible:ring-2 focus-visible:ring-ring"
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === 'Enter' && event.target === event.currentTarget) {
          onOpen()
        }
      }}
    >
      <p className="truncate pr-8 text-sm font-semibold">{schema.name}</p>
      <div className="absolute top-2.5 right-2.5 flex flex-col" onClick={(event) => event.stopPropagation()}>
        <button
          type="button"
          aria-label={`Detalhes de ${schema.name}`}
          className={CARD_BUTTON_CLASS}
          onClick={onDetails}
        >
          <LuEye className={CARD_ICON_CLASS} />
        </button>
        {schema.system && (
          <span aria-label="Sistema" className="flex size-7 items-center justify-center text-muted-foreground">
            <LuCog className={CARD_ICON_CLASS} />
          </span>
        )}
        {schema.deletable && (
          <ConfirmDialog
            title={deletion.title}
            description={
              <>
                {deletion.messageBefore}
                <strong className="font-semibold text-highlight">{schema.name}</strong>
                {deletion.messageAfter}
              </>
            }
            onConfirm={onDelete}
          >
            <button
              type="button"
              aria-label={`${deletion.action} ${schema.name}`}
              disabled={deleting}
              className={cn(CARD_BUTTON_CLASS, 'hover:text-destructive')}
            >
              {deleting ? <LuLoaderCircle className={cn(CARD_ICON_CLASS, 'animate-spin')} /> : <DeletionIcon className={CARD_ICON_CLASS} />}
            </button>
          </ConfirmDialog>
        )}
      </div>
      <dl className="mt-3 flex items-center gap-4 pr-8">
        {schema.stats.map(({ label, value, icon: Icon }) => (
          <div key={label} className="flex shrink-0 items-center gap-1.5">
            <dt className="shrink-0 text-muted-foreground">
              <Icon aria-label={label} className={CARD_ICON_CLASS} />
            </dt>
            <dd className="text-sm font-medium whitespace-nowrap">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

export function SchemaList({ connection, connected, onOpen, onCreated }: SchemaListProps) {
  const [listing, setListing] = useState<SchemaListing | null>(null)
  const [failed, setFailed] = useState(false)
  const [details, setDetails] = useState<SchemaRow | null>(null)
  const [creating, setCreating] = useState(false)
  const [dropping, setDropping] = useState<string | null>(null)
  const [dropError, setDropError] = useState('')

  const reload = useCallback(async () => {
    try {
      setListing(await refreshSchemas(connection))
      setFailed(false)
    } catch {
      setFailed(true)
    }
  }, [connection])

  const drop = async (name: string) => {
    setDropping(name)
    setDropError('')
    try {
      await dropSchema(connection.id, name)
      await reload()
      onCreated()
    } catch (failure) {
      setDropError(failure instanceof Error ? failure.message : 'Não foi possível concluir a ação.')
    }
    setDropping(null)
  }

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const cached = await fetchSchemas(connection)
        if (cancelled) return
        setListing(cached)
        setFailed(false)
        if (!cached.cached) return
        try {
          const fresh = await refreshSchemas(connection)
          if (!cancelled) setListing(fresh)
        } catch {
          // A lista em cache continua disponível enquanto o banco remoto não responde.
        }
      } catch {
        if (!cancelled) setFailed(true)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [connection, connected])

  if (listing === null && failed) {
    return (
      <div className="min-h-0 flex-1">
        <ErrorPlaceholder label="Sem dados salvos para esta conexão" />
      </div>
    )
  }

  if (listing === null) {
    return <ContentLoader className="min-h-48 flex-1" />
  }

  const schemas = listing.rows.filter(
    (schema) => (connection.showSystemSchemas || !schema.system)
      && (connection.showAllSchemas || connection.selectedSchemas.includes(schema.name)),
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
      {listing.cached && DRIVERS[connection.kind].showsLastSync && (
        <p role="status" className="shrink-0 text-xs text-muted-foreground">
          Última sincronização em {formatSyncedAt(listing.syncedAt)}
        </p>
      )}
      {dropError && (
        <p role="alert" className="max-h-16 shrink-0 overflow-y-auto text-sm wrap-anywhere text-destructive">
          {dropError}
        </p>
      )}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(max(13rem,calc((100%-2.25rem)/4)),1fr))] gap-3">
        {schemas.map((schema) => (
          <SchemaCard
            key={schema.name}
            schema={schema}
            deletion={DRIVERS[connection.kind].deletion}
            deleting={dropping === schema.name}
            onOpen={() => onOpen(schema.name)}
            onDetails={() => setDetails(schema)}
            onDelete={() => drop(schema.name)}
          />
        ))}
        {DRIVERS[connection.kind].canCreateSchema && (
          <button
            type="button"
            aria-label="Novo schema"
            className="flex min-h-24 items-center justify-center rounded-xl border border-dashed text-muted-foreground transition-colors outline-none hover:border-highlight hover:text-highlight focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => setCreating(true)}
          >
            <LuPlus className="size-5" />
          </button>
        )}
      </div>
      {creating && (
        <NewSchemaDialog
          connectionId={connection.id}
          onClose={() => setCreating(false)}
          onCreated={async () => {
            await reload()
            onCreated()
            setCreating(false)
          }}
        />
      )}
      <Dialog open={details !== null} onOpenChange={(open) => !open && setDetails(null)}>
        <DialogContent showCloseButton={false} className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {details?.name}
              {details?.system && (
                <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground uppercase">
                  <LuCog className="size-3" />
                  Sistema
                </span>
              )}
            </DialogTitle>
            <DialogDescription className="sr-only">Informações do schema</DialogDescription>
          </DialogHeader>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
            {details?.details.map(({ label, value }) => (
              <div key={label} className="min-w-0">
                <dt className="text-xs text-muted-foreground">{label}</dt>
                <dd className="truncate text-sm font-medium" title={value}>
                  {value}
                </dd>
              </div>
            ))}
          </dl>
          <DialogFooter>
            <Button onClick={() => setDetails(null)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
