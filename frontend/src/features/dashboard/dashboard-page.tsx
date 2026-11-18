import { useEffect, useState } from 'react'
import type { IconType } from 'react-icons'
import {
  LuActivity,
  LuBoxes,
  LuChevronRight,
  LuHardDrive,
  LuLink,
  LuSquareTerminal,
} from 'react-icons/lu'
import type { Bootstrap, ModuleStatus, Page, RuntimeStatus } from '../../api'
import {
  fetchDockerContainers,
  fetchSgbdConnections,
  fetchTerminalTabs,
} from '../../api'
import { AppLogo } from '../brand/app-logo'
import { ActivityItem } from '../activity/activity-item'
import { formatBytes, percentageUsed } from '../../shared/lib/format'
import { cn } from '../../shared/lib/cn'

const DASHBOARD_BANNER_KEY = 'godard-stack.dashboard-banner-dismissed'

type DashboardPageProps = {
  runtime: RuntimeStatus
  state: Bootstrap
  onNavigate: (page: Extract<Page, 'terminal' | 'sgbd' | 'docker'>) => void
  onOpenActivity: () => void
}

function useDashboardCounts(runtime: RuntimeStatus) {
  const [consolesCount, setConsolesCount] = useState<number | null>(null)
  const [containersCount, setContainersCount] = useState<number | null>(null)
  const [connectionsCount, setConnectionsCount] = useState<number | null>(null)

  useEffect(() => {
    if (runtime.status !== 'ready') return
    fetchTerminalTabs(runtime)
      .then((tabs) => setConsolesCount(tabs.length))
      .catch(() => setConsolesCount(0))
    fetchDockerContainers(runtime)
      .then((containers) => setContainersCount(containers.filter((c) => c.running).length))
      .catch(() => setContainersCount(0))
    fetchSgbdConnections(runtime)
      .then((connections) => setConnectionsCount(connections.length))
      .catch(() => setConnectionsCount(0))
  }, [runtime])

  return { consolesCount, containersCount, connectionsCount }
}

export function DashboardPage({ runtime, state, onNavigate, onOpenActivity }: DashboardPageProps) {
  const memory = percentageUsed(state.system.memoryTotal, state.system.memoryAvailable)
  const disk = percentageUsed(state.system.diskTotal, state.system.diskAvailable)
  const { consolesCount, containersCount, connectionsCount } = useDashboardCounts(runtime)
  const [institutionalBannerVisible, setInstitutionalBannerVisible] =
    useState(isDashboardBannerVisible)
  const modules = Object.fromEntries(state.modules.map((item) => [item.id, item])) as Partial<
    Record<ModuleStatus['id'], ModuleStatus>
  >
  const summaries: Array<{
    id: Extract<Page, 'terminal' | 'sgbd' | 'docker'>
    label: string
    icon: IconType
    count: number | null
  }> = [
    { id: 'docker', label: 'Contêineres ativos', icon: LuBoxes, count: containersCount },
    { id: 'sgbd', label: 'Conexões', icon: LuLink, count: connectionsCount },
    { id: 'terminal', label: 'Consoles', icon: LuSquareTerminal, count: consolesCount },
  ]

  return (
    <div className="animate-in fade-in flex min-h-full flex-col p-6 duration-200">
      <div className="space-y-5 pb-5">
        <section className="grid gap-3 xl:grid-cols-3">
          {summaries.map((summary) => (
            <SummaryCard
              key={summary.id}
              label={summary.label}
              value={summary.count === null ? '—' : String(summary.count)}
              detail={modules[summary.id]?.detail ?? 'Módulo em preparação'}
              icon={summary.icon}
              onClick={() => onNavigate(summary.id)}
            />
          ))}
        </section>
        <section className="grid gap-5 lg:grid-cols-2">
          <ResourceUsageCard
            memory={memory}
            disk={disk}
            memoryAvailable={state.system.memoryAvailable}
            diskAvailable={state.system.diskAvailable}
          />
          <RecentActivityCard state={state} onOpenActivity={onOpenActivity} />
        </section>
        <section className="grid gap-5 xl:grid-cols-[1.3fr_0.7fr]">
          <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
            <SectionHeader icon={LuBoxes} title="Contêineres em execução" />
            <EmptyDashboardTable
              columns={['Nome', 'Imagem / Versão', 'Portas', 'Status']}
              message="Abra o módulo Contêineres para consultar o Docker local."
            />
          </section>
          <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
            <SectionHeader icon={LuLink} title="Conexões" />
            <div className="px-5 py-8 text-center text-sm text-muted-foreground">
              {connectionsCount === null
                ? 'Carregando…'
                : connectionsCount === 0
                  ? 'Nenhuma conexão cadastrada'
                  : `${connectionsCount} conexão${connectionsCount !== 1 ? 'ões' : ''} cadastrada${connectionsCount !== 1 ? 's' : ''}`}
            </div>
          </section>
        </section>
      </div>
      {institutionalBannerVisible && (
        <DashboardBanner
          onDismiss={() => {
            dismissDashboardBanner()
            setInstitutionalBannerVisible(false)
          }}
        />
      )}
    </div>
  )
}

function ResourceUsageCard({
  memory,
  disk,
  memoryAvailable,
  diskAvailable,
}: {
  memory: number | null
  disk: number | null
  memoryAvailable: number
  diskAvailable: number
}) {
  return (
    <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
      <SectionHeader icon={LuHardDrive} title="Uso de recursos" />
      <div className="space-y-5 p-5">
        <ResourceBar
          label="Memória"
          percent={memory}
          detail={`${formatBytes(memoryAvailable)} livres`}
        />
        <ResourceBar
          label="Disco"
          percent={disk}
          detail={`${formatBytes(diskAvailable)} livres`}
          muted
        />
      </div>
    </section>
  )
}

function ResourceBar({
  label,
  percent,
  detail,
  muted,
}: {
  label: string
  percent: number | null
  detail: string
  muted?: boolean
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium">{label}</span>
        <span className="tabular-nums text-muted-foreground">
          {percent !== null ? `${percent}%` : '—'} · {detail}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            'h-full rounded-full transition-all duration-500',
            muted ? 'bg-primary/60' : 'bg-primary',
          )}
          style={{ width: `${percent ?? 0}%` }}
        />
      </div>
    </div>
  )
}

function RecentActivityCard({
  state,
  onOpenActivity,
}: {
  state: Bootstrap
  onOpenActivity: () => void
}) {
  return (
    <section className="flex h-full flex-col overflow-hidden rounded-xl border bg-card shadow-sm">
      <SectionHeader
        icon={LuActivity}
        title="Atividade recente"
        action="Ver tudo"
        onAction={onOpenActivity}
      />
      <div className={state.activities.length === 0 ? 'flex flex-1 px-5' : 'px-5'}>
        {state.activities.length === 0 && (
          <div className="grid flex-1 place-items-center text-muted-foreground">
            <LuActivity className="size-8" />
          </div>
        )}
        {state.activities.slice(0, 5).map((activity) => (
          <ActivityItem key={activity.id} activity={activity} />
        ))}
      </div>
    </section>
  )
}

function DashboardBanner({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-20 ml-20 mr-70 px-6">
      <footer className="pointer-events-auto mx-auto flex w-full max-w-520 flex-col items-start gap-5 overflow-hidden rounded-2xl border border-primary/20 bg-card/95 p-5 shadow-lg shadow-black/10 backdrop-blur-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          <AppLogo className="size-14 shrink-0" />
          <p className="max-w-2xl text-sm text-muted-foreground">
            Uma central local para acompanhar e operar seu ambiente de desenvolvimento.
          </p>
        </div>
        <button
          type="button"
          className="h-9 shrink-0 px-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          onClick={onDismiss}
        >
          Fechar
        </button>
      </footer>
    </div>
  )
}

function SummaryCard({
  label,
  value,
  detail,
  icon: Icon,
  onClick,
}: {
  label: string
  value: string
  detail: string
  icon: IconType
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-label={`${label}: ${value}`}
      className="flex min-h-31 items-center gap-4 rounded-xl border bg-card p-4 text-left shadow-sm transition-[border-color,transform] hover:-translate-y-0.5 hover:border-highlight focus-visible:ring-2 focus-visible:ring-ring"
      onClick={onClick}
    >
      <span className="grid size-16 shrink-0 place-items-center rounded-full bg-primary-soft text-highlight">
        <Icon className="size-8" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          {label}
        </span>
        <span className="mt-1 block text-2xl font-semibold tracking-tight tabular-nums">
          {value}
        </span>
        <span className="block truncate text-sm text-muted-foreground">{detail}</span>
      </span>
    </button>
  )
}

function SectionHeader({
  icon: Icon,
  title,
  action,
  onAction,
}: {
  icon: IconType
  title: string
  action?: string
  onAction?: () => void
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b px-5 py-3.5">
      <h2 className="flex items-center gap-2 text-base font-semibold tracking-tight">
        <Icon className="size-5 text-highlight" />
        {title}
      </h2>
      {action && (
        <button
          type="button"
          className="flex items-center gap-1 text-sm font-medium text-highlight hover:underline"
          onClick={onAction}
        >
          {action}
          <LuChevronRight className="size-4" />
        </button>
      )}
    </div>
  )
}

function EmptyDashboardTable({ columns, message }: { columns: string[]; message: string }) {
  return (
    <div className="max-h-55 overflow-auto">
      <div className="min-w-170 px-5">
        <div className="grid grid-cols-[minmax(10rem,1.15fr)_minmax(10rem,1fr)_minmax(12rem,1.2fr)_8rem] gap-4 border-b py-2.5 text-xs font-medium text-muted-foreground">
          {columns.map((column) => (
            <span key={column}>{column}</span>
          ))}
        </div>
        <div className="py-8 text-center text-sm text-muted-foreground">{message}</div>
      </div>
    </div>
  )
}

function isDashboardBannerVisible() {
  try {
    return localStorage.getItem(DASHBOARD_BANNER_KEY) !== 'true'
  } catch {
    return true
  }
}

function dismissDashboardBanner() {
  try {
    localStorage.setItem(DASHBOARD_BANNER_KEY, 'true')
  } catch {
    return
  }
}
