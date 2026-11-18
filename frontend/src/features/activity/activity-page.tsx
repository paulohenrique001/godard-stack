import { useEffect, useState, type FormEvent } from 'react'
import {
  LuActivity,
  LuChevronDown,
  LuChevronLeft,
  LuChevronRight,
  LuSearch,
  LuTrash2,
} from 'react-icons/lu'
import type { Activity } from '../../api'
import { useModalDialog } from '../accessibility/use-modal-dialog'
import { ActivityItem } from './activity-item'

type ActivityPageProps = {
  activities: Activity[]
  onClear: () => Promise<void>
}

export function ActivityPage({ activities, onClear }: ActivityPageProps) {
  const [query, setQuery] = useState('')
  const [appliedQuery, setAppliedQuery] = useState('')
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(10)
  const [confirming, setConfirming] = useState(false)
  const [clearing, setClearing] = useState(false)
  const filtered = activities.filter((activity) =>
    activity.message.toLocaleLowerCase('pt-BR').includes(appliedQuery.toLocaleLowerCase('pt-BR')),
  )
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const visible = filtered.slice(page * pageSize, (page + 1) * pageSize)
  const first = filtered.length === 0 ? 0 : page * pageSize + 1
  const last = Math.min((page + 1) * pageSize, filtered.length)

  useEffect(() => {
    setPage((current) => Math.min(current, pages - 1))
  }, [pages])

  const clear = async () => {
    setClearing(true)
    try {
      await onClear()
      setPage(0)
      setConfirming(false)
    } finally {
      setClearing(false)
    }
  }

  const applyQuery = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setPage(0)
    setAppliedQuery(query.trim())
  }

  return (
    <div className="animate-in fade-in space-y-5 p-6 duration-200">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
            <LuActivity className="size-5 text-highlight" />
            Atividades
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Histórico do ambiente salvo localmente
          </p>
        </div>
        <button
          type="button"
          disabled={activities.length === 0}
          className="flex h-9 items-center gap-2 rounded-lg border px-3 text-sm font-medium uppercase transition-colors hover:bg-muted disabled:opacity-50"
          onClick={() => setConfirming(true)}
        >
          <LuTrash2 className="size-4" />
          Limpar logs
        </button>
      </header>
      <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <ActivityFilters
          query={query}
          pageSize={pageSize}
          onQueryChange={setQuery}
          onSubmit={applyQuery}
          onPageSizeChange={(size) => {
            setPage(0)
            setPageSize(size)
          }}
        />
        <div className="px-5">
          {visible.length === 0 && (
            <div className="py-14 text-center text-sm text-muted-foreground">
              Nenhuma atividade encontrada
            </div>
          )}
          {visible.map((activity) => (
            <ActivityItem key={activity.id} activity={activity} detailed />
          ))}
        </div>
        <ActivityPagination
          first={first}
          last={last}
          total={filtered.length}
          page={page}
          pages={pages}
          onPrevious={() => setPage((current) => Math.max(0, current - 1))}
          onNext={() => setPage((current) => current + 1)}
        />
      </section>
      {confirming && (
        <ConfirmClearDialog
          clearing={clearing}
          onCancel={() => setConfirming(false)}
          onConfirm={() => void clear()}
        />
      )}
    </div>
  )
}

function ActivityFilters({
  query,
  pageSize,
  onQueryChange,
  onSubmit,
  onPageSizeChange,
}: {
  query: string
  pageSize: number
  onQueryChange: (query: string) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  onPageSizeChange: (size: number) => void
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
      <form className="flex min-w-0 flex-1 items-center gap-2" onSubmit={onSubmit}>
        <input
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Buscar atividades"
          className="h-9 w-full max-w-md rounded-lg border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <button
          type="submit"
          aria-label="Buscar"
          className="grid size-9 place-items-center rounded-lg border transition-colors hover:bg-muted"
        >
          <LuSearch className="size-4" />
        </button>
      </form>
      <div className="relative">
        <select
          aria-label="Itens por página"
          value={pageSize}
          onChange={(event) => onPageSizeChange(Number(event.target.value))}
          className="h-9 appearance-none rounded-lg border bg-card py-1 pr-8 pl-3 text-sm font-medium outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
        >
          <option value={10}>10 por página</option>
          <option value={25}>25 por página</option>
          <option value={50}>50 por página</option>
        </select>
        <LuChevronDown className="pointer-events-none absolute top-2.5 right-2.5 size-4 text-muted-foreground" />
      </div>
    </div>
  )
}

function ActivityPagination({
  first,
  last,
  total,
  page,
  pages,
  onPrevious,
  onNext,
}: {
  first: number
  last: number
  total: number
  page: number
  pages: number
  onPrevious: () => void
  onNext: () => void
}) {
  return (
    <footer className="flex items-center justify-between gap-3 border-t p-3 text-sm text-muted-foreground">
      <span className="tabular-nums">
        {first}-{last} de {total}
      </span>
      <div className="flex items-center gap-1">
        <button
          type="button"
          aria-label="Página anterior"
          disabled={page === 0}
          className="grid size-8 place-items-center rounded-md transition-colors hover:bg-muted disabled:opacity-50"
          onClick={onPrevious}
        >
          <LuChevronLeft className="size-4" />
        </button>
        <span className="min-w-16 text-center text-xs tabular-nums">
          {page + 1} de {pages}
        </span>
        <button
          type="button"
          aria-label="Próxima página"
          disabled={page + 1 >= pages}
          className="grid size-8 place-items-center rounded-md transition-colors hover:bg-muted disabled:opacity-50"
          onClick={onNext}
        >
          <LuChevronRight className="size-4" />
        </button>
      </div>
    </footer>
  )
}

function ConfirmClearDialog({
  clearing,
  onCancel,
  onConfirm,
}: {
  clearing: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  const dialogRef = useModalDialog(true, clearing ? undefined : onCancel)

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-6 backdrop-blur-[2px]"
      role="presentation"
      onMouseDown={() => {
        if (!clearing) onCancel()
      }}
    >
      <section
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="clear-activities-title"
        className="w-full max-w-md rounded-2xl border bg-popover p-6 shadow-2xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2 id="clear-activities-title" className="text-lg font-semibold tracking-tight">
          Limpar atividades
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Todos os registros de atividade serão removidos desta aplicação.
        </p>
        <div className="mt-6 flex justify-end gap-2">
          <button
            data-dialog-initial-focus
            type="button"
            disabled={clearing}
            className="h-9 rounded-lg px-3 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-50"
            onClick={onCancel}
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={clearing}
            className="h-9 rounded-lg bg-destructive px-3 text-sm font-medium text-white transition-colors hover:brightness-95 disabled:opacity-50"
            onClick={onConfirm}
          >
            {clearing ? 'Limpando...' : 'Limpar logs'}
          </button>
        </div>
      </section>
    </div>
  )
}
