import type { IconType } from 'react-icons'
import {
  LuActivity,
  LuBoxes,
  LuCheck,
  LuChevronDown,
  LuChevronRight,
  LuCirclePlay,
  LuHardDrive,
  LuLink,
  LuServer,
  LuSquareTerminal,
  LuUnplug,
} from 'react-icons/lu'
import { Select } from 'radix-ui'
import { ContentLoader } from '@/components/ui/content-loader'
import { AppLogo } from '@/features/brand/app-logo'
import { stateLabel } from '@/features/docker/docker-api'
import type { Page } from '@/features/layout/pages'
import { SgbdIcon } from '@/features/sgbd/sgbd-icon'
import type { DashboardRefresh } from '@/features/dashboard/use-dashboard-refresh'
import { cn } from '@/lib/utils'

const MOCK_SUMMARIES = [
  { id: 'containers' as const, label: 'Contêineres', icon: LuBoxes, page: 'docker' as Page },
  { id: 'connections' as const, label: 'Conexões', icon: LuLink, page: 'sgbd' as Page },
  { id: 'consoles' as const, label: 'Consoles', icon: LuSquareTerminal, page: 'terminal' as Page },
]

const ACTIVITY_ICONS = {
  container: LuCirclePlay,
  connection: LuLink,
  console: LuSquareTerminal,
  command: LuSquareTerminal,
  system: LuServer,
}

const RESOURCE_RANGES = [5, 15, 30] as const
const MAX_RESOURCE_POINTS = 5

type SummaryCardProps = {
  label: string
  value: string
  detail: string
  progress: number | null
  icon: IconType
  onClick: () => void
}

function ProgressRing({ value }: { value: number }) {
  return (
    <div
      aria-label={`${value}%`}
      className="grid size-18 shrink-0 place-items-center rounded-full"
      style={{ background: `conic-gradient(var(--primary) ${value}%, var(--muted) 0)` }}
    >
      <div className="grid size-13 place-items-center rounded-full bg-card text-sm font-semibold tabular-nums">{value}%</div>
    </div>
  )
}

function SummaryCard({ label, value, detail, progress, icon: Icon, onClick }: SummaryCardProps) {
  return (
    <button
      type="button"
      aria-label={`${label}: ${value} ${detail}`}
      className="flex min-h-31 items-center gap-4 rounded-xl border bg-card p-4 text-left shadow-sm transition-[border-color,transform] hover:-translate-y-0.5 hover:border-highlight focus-visible:ring-2 focus-visible:ring-ring"
      onClick={onClick}
    >
      <span className="grid size-16 shrink-0 place-items-center rounded-full bg-primary-soft text-highlight"><Icon className="size-8" /></span>
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-semibold tracking-wide text-muted-foreground uppercase">{label}</span>
        <span className="mt-1 block text-2xl font-semibold tracking-tight tabular-nums">{value}</span>
        <span className="block text-sm text-muted-foreground">{detail}</span>
      </span>
      {progress === null ? (
        <span className="rounded-full border bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">Interativos</span>
      ) : <ProgressRing value={progress} />}
    </button>
  )
}

function SectionHeader({ icon: Icon, title, action, onAction }: { icon: IconType; title: string; action?: string; onAction?: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b px-5 py-3.5">
      <h2 className="flex items-center gap-2 text-base font-semibold tracking-tight"><Icon className="size-5 text-highlight" />{title}</h2>
      {action && <button type="button" className="flex items-center gap-1 text-sm font-medium text-highlight hover:underline" onClick={onAction}>{action}<LuChevronRight className="size-4" /></button>}
    </div>
  )
}

function chartPoints(values: Array<number | null>) {
  const available = values.length > 1 ? values : values.concat(values)
  return available.map((value, index) => {
    const x = (index / (available.length - 1)) * 100
    const y = 100 - (value ?? 0)
    return `${x},${y}`
  }).join(' ')
}

function chartHistory(history: DashboardRefresh['resources']['history'], range: number) {
  const period = history.slice(-(range + 1))
  if (period.length <= MAX_RESOURCE_POINTS) {
    return period
  }
  return Array.from({ length: MAX_RESOURCE_POINTS }, (_, index) => {
    const position = Math.round(index * (period.length - 1) / (MAX_RESOURCE_POINTS - 1))
    return period[position]
  })
}

function ResourceChart({ dashboard }: { dashboard: DashboardRefresh }) {
  const history = chartHistory(dashboard.resources.history, dashboard.resourceRange)
  const memoryPoints = chartPoints(history.map((sample) => sample.memory))
  const diskPoints = chartPoints(history.map((sample) => sample.disk))
  const formatTime = (offsetMinutes: number) => new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' })
    .format(new Date(Date.now() - offsetMinutes * 60_000))
  const first = formatTime(dashboard.resourceRange)
  const middle = formatTime(dashboard.resourceRange / 2)
  const latest = formatTime(0)

  return (
    <div className="relative h-44 overflow-hidden rounded-lg border bg-muted/45">
      {history.length === 0 ? (
        <ContentLoader className="h-full min-h-0" />
      ) : (
        <svg className="absolute inset-x-0 top-0 h-36 w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-label="Histórico de uso de recursos">
          <path d="M0 25H100M0 50H100M0 75H100" fill="none" stroke="var(--border)" strokeWidth="0.7" vectorEffect="non-scaling-stroke" />
          <polyline points={memoryPoints} fill="none" stroke="var(--primary)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
          {dashboard.resources.disk !== null && <polyline points={diskPoints} fill="none" stroke="var(--primary)" strokeWidth="1.5" strokeDasharray="4 3" opacity="0.7" vectorEffect="non-scaling-stroke" />}
        </svg>
      )}
      {history.length > 0 && <div className="absolute inset-x-0 bottom-2 flex justify-between px-3 text-[10px] text-muted-foreground"><span>{first}</span><span>{middle}</span><span>{latest}</span></div>}
    </div>
  )
}

function activityTime(createdAt: string) {
  const date = new Date(createdAt)
  return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(date)
}

type DashboardPageProps = {
  onNavigate: (page: Page) => void
  onOpenContainer: (name: string) => void
  onOpenConnection: (id: number) => void
  dashboard: DashboardRefresh
}

export function DashboardPage({ onNavigate, onOpenContainer, onOpenConnection, dashboard }: DashboardPageProps) {
  const visibleContainers = dashboard.containers.filter((container) => container.running
    && !container.protected
    && !/^godard-stack(?:[-_].*)?$/i.test(container.name))

  return (
    <div className="animate-in fade-in flex min-h-full flex-col p-6 duration-200">
      <div className="space-y-5 pb-5">
      <section className="grid gap-3 xl:grid-cols-3">
        {MOCK_SUMMARIES.map((summary) => (
          <SummaryCard
            key={summary.id}
            {...summary}
            {...dashboard.summaries[summary.id]}
            onClick={() => onNavigate(summary.page)}
          />
        ))}
      </section>

      <section className="grid gap-5 lg:grid-cols-2">
        <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
          <SectionHeader icon={LuHardDrive} title="Uso de recursos" />
          <div className="p-5">
            <ResourceChart dashboard={dashboard} />
            <div className="mt-4 flex items-center justify-between gap-4">
              <div className="flex min-w-0 items-center gap-5 text-xs text-muted-foreground"><span className="flex min-w-0 items-center gap-1.5"><span className="size-2.5 shrink-0 rounded-full bg-primary" />Memória ({dashboard.resources.memory ?? '—'}%) · {dashboard.resources.memoryDetail}</span><span className="flex min-w-0 items-center gap-1.5"><span className="size-2.5 shrink-0 rounded-full border-2 border-primary" />Disco ({dashboard.resources.disk ?? '—'}%) · {dashboard.resources.diskDetail}</span></div>
              <Select.Root value={String(dashboard.resourceRange)} onValueChange={(value) => dashboard.setResourceRange(Number(value) as 5 | 15 | 30)}>
                <Select.Trigger
                  aria-label="Período do histórico de recursos"
                  className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border bg-card px-2.5 text-xs font-medium text-foreground outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Select.Value />
                  <Select.Icon><LuChevronDown className="size-3.5 text-muted-foreground" /></Select.Icon>
                </Select.Trigger>
                <Select.Portal>
                  <Select.Content position="popper" align="end" sideOffset={4} className="z-50 min-w-(--radix-select-trigger-width) overflow-hidden rounded-lg border bg-popover p-1 shadow-md">
                    <Select.Viewport>
                      {RESOURCE_RANGES.map((range) => (
                        <Select.Item key={range} value={String(range)} className="flex cursor-pointer items-center justify-between gap-4 rounded-md px-2.5 py-2 text-xs outline-none data-highlighted:bg-muted">
                          <Select.ItemText>{range} min</Select.ItemText>
                          <Select.ItemIndicator><LuCheck className="size-3.5 text-highlight" /></Select.ItemIndicator>
                        </Select.Item>
                      ))}
                    </Select.Viewport>
                  </Select.Content>
                </Select.Portal>
              </Select.Root>
            </div>
          </div>
        </div>
        <div className="flex h-full flex-col overflow-hidden rounded-xl border bg-card shadow-sm">
          <SectionHeader icon={LuActivity} title="Atividade recente" action="Ver tudo" onAction={() => onNavigate('activity')} />
          <div className={cn('px-5', dashboard.activities.length === 0 && 'flex flex-1')}>
            {dashboard.activities.length === 0 && <div className="grid flex-1 place-items-center text-muted-foreground"><LuActivity className="size-8" /></div>}
            {dashboard.activities.slice(0, 5).map(({ id, kind, message, createdAt, tone }) => {
              const Icon = ACTIVITY_ICONS[kind]
              return <div key={id} className="flex items-center gap-3 border-b py-3 last:border-b-0">
                <span className={cn('grid size-6 shrink-0 place-items-center rounded-full', tone === 'success' && 'bg-success/15 text-success', tone === 'primary' && 'bg-primary-soft text-highlight', tone === 'muted' && 'bg-muted text-muted-foreground', tone === 'warning' && 'bg-primary-soft text-warning')}><Icon className="size-3.5" /></span>
                <span className="min-w-0 flex-1 truncate text-sm">{message}</span><time className="text-xs tabular-nums text-muted-foreground">{activityTime(createdAt)}</time>
              </div>
            })}
          </div>
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.3fr_0.7fr]">
        <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
          <SectionHeader icon={LuBoxes} title="Contêineres em execução" />
          <div className="max-h-55 overflow-auto">
            <div className="min-w-170 px-5">
              <div className="sticky top-0 z-10 grid grid-cols-[minmax(10rem,1.15fr)_minmax(10rem,1fr)_minmax(12rem,1.2fr)_8rem] gap-4 border-b bg-card py-2.5 text-xs font-medium text-muted-foreground"><span>Nome</span><span>Imagem / Versão</span><span>Portas</span><span>Status</span></div>
              {visibleContainers.map((container) => (
                <button key={container.id} type="button" className="grid w-full grid-cols-[minmax(10rem,1.15fr)_minmax(10rem,1fr)_minmax(12rem,1.2fr)_8rem] items-center gap-4 border-b py-3 text-left text-sm last:border-b-0 hover:bg-muted/70" onClick={() => onOpenContainer(container.name)}>
                  <span className="flex min-w-0 items-center gap-3 font-medium"><span className="size-2.5 shrink-0 rounded-full bg-success" /><span className="truncate">{container.name}</span></span>
                  <span className="truncate text-muted-foreground">{container.image}</span>
                  <span className="w-fit rounded-full bg-muted px-2.5 py-1 font-medium text-muted-foreground">{container.ports.join(', ') || '—'}</span>
                  <span className="w-fit rounded-full bg-success/15 px-2.5 py-1 text-xs font-semibold text-success">{stateLabel(container.state)}</span>
                </button>
              ))}
              {dashboard.containers.length > 0 && visibleContainers.length === 0 && <div className="py-8 text-center text-sm text-muted-foreground">Nenhum contêiner em execução</div>}
            </div>
          </div>
        </section>

        <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
          <SectionHeader icon={LuLink} title="Conexões" />
          <div className="max-h-50 overflow-y-auto px-5">
            {dashboard.connections.map(({ connection, connected, pingMs, requiresManualPing }) => (
              <button key={connection.id} type="button" className="grid w-full grid-cols-[minmax(12rem,1fr)_auto_auto] items-center gap-4 border-b py-3 text-left last:border-b-0 hover:bg-muted/70" onClick={() => onOpenConnection(connection.id)}>
                <span className="flex min-w-0 items-center gap-3"><SgbdIcon kind={connection.kind} className="size-9 shrink-0" /><span className="min-w-0"><span className={cn('block truncate font-medium', requiresManualPing && 'text-warning')}>{connection.name}</span><span className="block truncate text-sm text-muted-foreground">{connection.kind} · {connection.database}</span></span></span>
                <span className={cn('flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold', connected ? 'bg-success/15 text-success' : !connection.autoPing ? 'bg-muted text-muted-foreground' : 'bg-primary-soft text-warning')}><LuCheck className="size-3.5" />{connected ? 'Conectado' : !connection.autoPing || requiresManualPing ? 'Manual' : 'Indisponível'}</span>
                <span
                  aria-label={pingMs === null ? connection.autoPing ? 'Ping indisponível' : 'Ping manual' : `${pingMs} ms`}
                  title={pingMs === null ? connection.autoPing ? 'Ping indisponível' : 'Ping manual' : undefined}
                  className="flex min-h-7 min-w-10 items-center justify-center rounded-full bg-primary-soft px-2.5 py-1 text-xs font-semibold text-highlight"
                >
                  {pingMs === null ? <LuUnplug className="size-3.5" /> : `${pingMs} ms`}
                </span>
              </button>
            ))}
            {dashboard.connections.length === 0 && <div className="py-8 text-center text-sm text-muted-foreground">Nenhuma conexão cadastrada</div>}
          </div>
        </section>
      </section>
      </div>

      {dashboard.institutionalBannerVisible && (
        <div className="pointer-events-none fixed inset-x-0 bottom-6 z-20 ml-20 mr-70 px-6">
          <footer className="pointer-events-auto mx-auto flex w-full max-w-520 flex-col items-start gap-5 overflow-hidden rounded-2xl border border-primary/20 bg-card/95 p-5 shadow-lg shadow-black/10 backdrop-blur-sm sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center gap-4">
              <AppLogo className="size-14 shrink-0" />
              <div className="min-w-0">
                <p className="mt-1 max-w-2xl text-sm text-muted-foreground">Uma central local para acompanhar e operar seu ambiente de desenvolvimento.</p>
              </div>
            </div>
            <button type="button" className="h-9 shrink-0 px-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground" onClick={() => void dashboard.dismissBanner()}>Fechar</button>
          </footer>
        </div>
      )}

    </div>
  )
}
