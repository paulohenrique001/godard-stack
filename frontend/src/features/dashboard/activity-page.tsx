import { useCallback, useEffect, useState } from 'react'
import { LuActivity, LuCheck, LuChevronDown, LuChevronLeft, LuChevronRight, LuCirclePlay, LuLink, LuSearch, LuServer, LuSquareTerminal, LuTrash2 } from 'react-icons/lu'
import { Select } from 'radix-ui'
import { Button } from '@/components/ui/button'
import { ContentLoader } from '@/components/ui/content-loader'
import { Input } from '@/components/ui/input'
import { clearActivities, fetchActivities, type ActivityLog, type ActivityPageSize } from '@/features/dashboard/activity-api'
import { ConfirmDialog } from '@/features/docker/confirm-dialog'
import { cn } from '@/lib/utils'

const ACTIVITY_ICONS = {
  container: LuCirclePlay,
  connection: LuLink,
  console: LuSquareTerminal,
  command: LuSquareTerminal,
  system: LuServer,
}

const PAGE_SIZES: ActivityPageSize[] = [10, 25, 50]

function activityTime(createdAt: string) {
  const date = new Date(createdAt)
  return Number.isNaN(date.getTime())
    ? '—'
    : new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(date)
}

export function ActivityPage({ onCleared }: { onCleared: () => Promise<void> }) {
  const [query, setQuery] = useState('')
  const [appliedQuery, setAppliedQuery] = useState('')
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState<ActivityPageSize>(10)
  const [items, setItems] = useState<ActivityLog[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const result = await fetchActivities({ query: appliedQuery, page, size: pageSize })
      setItems(result.items)
      setTotal(result.total)
    } catch {
      setItems([])
      setTotal(0)
    }
    setLoading(false)
  }, [appliedQuery, page, pageSize])

  useEffect(() => {
    void load()
  }, [load])

  const pages = Math.max(1, Math.ceil(total / pageSize))
  const first = total === 0 ? 0 : page * pageSize + 1
  const last = Math.min((page + 1) * pageSize, total)

  const clear = async () => {
    await clearActivities()
    await onCleared()
    setPage(0)
    setItems([])
    setTotal(0)
  }

  return (
    <div className="animate-in fade-in space-y-5 p-6 duration-200">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-semibold tracking-tight"><LuActivity className="size-5 text-highlight" />Atividades</h2>
          <p className="mt-1 text-sm text-muted-foreground">Histórico do ambiente salvo localmente</p>
        </div>
        <ConfirmDialog
          title="Limpar atividades"
          description="Todos os registros de atividade serão removidos desta aplicação."
          onConfirm={() => { void clear() }}
        >
          <Button variant="outline" className="uppercase" disabled={total === 0 || loading}><LuTrash2 />Limpar logs</Button>
        </ConfirmDialog>
      </header>

      <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
          <form
            className="flex min-w-0 flex-1 items-center gap-2"
            onSubmit={(event) => {
              event.preventDefault()
              setPage(0)
              setAppliedQuery(query.trim())
            }}
          >
            <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar atividades" className="max-w-md" />
            <Button type="submit" variant="outline" size="icon" aria-label="Buscar"><LuSearch /></Button>
          </form>
          <Select.Root value={String(pageSize)} onValueChange={(value) => { setPage(0); setPageSize(Number(value) as ActivityPageSize) }}>
            <Select.Trigger aria-label="Itens por página" className="inline-flex h-9 items-center gap-1.5 rounded-lg border bg-card px-3 text-sm font-medium outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring">
              <Select.Value />
              <Select.Icon><LuChevronDown className="size-4 text-muted-foreground" /></Select.Icon>
            </Select.Trigger>
            <Select.Portal>
              <Select.Content position="popper" align="end" sideOffset={4} className="z-50 min-w-(--radix-select-trigger-width) overflow-hidden rounded-lg border bg-popover p-1 shadow-md">
                <Select.Viewport>
                  {PAGE_SIZES.map((size) => (
                    <Select.Item key={size} value={String(size)} className="flex cursor-pointer items-center justify-between gap-4 rounded-md px-2.5 py-2 text-sm outline-none data-highlighted:bg-muted">
                      <Select.ItemText>{size} por página</Select.ItemText>
                      <Select.ItemIndicator><LuCheck className="size-4 text-highlight" /></Select.ItemIndicator>
                    </Select.Item>
                  ))}
                </Select.Viewport>
              </Select.Content>
            </Select.Portal>
          </Select.Root>
        </div>

        <div className="px-5">
          {loading && <ContentLoader className="min-h-56" />}
          {!loading && items.length === 0 && <div className="py-14 text-center text-sm text-muted-foreground">Nenhuma atividade encontrada</div>}
          {!loading && items.map(({ id, kind, message, createdAt, tone }) => {
            const Icon = ACTIVITY_ICONS[kind]
            return (
              <div key={id} className="flex items-center gap-3 border-b py-4 last:border-b-0">
                <span className={cn('grid size-8 shrink-0 place-items-center rounded-full', tone === 'success' && 'bg-success/15 text-success', tone === 'primary' && 'bg-primary-soft text-highlight', tone === 'muted' && 'bg-muted text-muted-foreground', tone === 'warning' && 'bg-primary-soft text-warning')}><Icon className="size-4" /></span>
                <span className="min-w-0 flex-1 text-sm">{message}</span>
                <time className="shrink-0 text-xs tabular-nums text-muted-foreground">{activityTime(createdAt)}</time>
              </div>
            )
          })}
        </div>

        <footer className="flex items-center justify-between gap-3 border-t p-3 text-sm text-muted-foreground">
          <span className="tabular-nums">{first}-{last} de {total}</span>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon-sm" aria-label="Página anterior" disabled={loading || page === 0} onClick={() => setPage((current) => Math.max(0, current - 1))}><LuChevronLeft /></Button>
            <span className="min-w-16 text-center text-xs tabular-nums">{page + 1} de {pages}</span>
            <Button variant="ghost" size="icon-sm" aria-label="Próxima página" disabled={loading || page + 1 >= pages} onClick={() => setPage((current) => current + 1)}><LuChevronRight /></Button>
          </div>
        </footer>
      </section>
    </div>
  )
}
