import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchContainers, type DockerContainer } from '@/features/docker/docker-api'
import { fetchActivities, recordActivity, type ActivityKind, type ActivityLog, type ActivityTone } from '@/features/dashboard/activity-api'
import { dismissInstitutionalBanner, fetchInstitutionalBanner } from '@/features/dashboard/dashboard-institutional-banner-api'
import { fetchDashboardSnapshot, saveDashboardSnapshot } from '@/features/dashboard/dashboard-snapshot-api'
import { fetchDashboardResourceHistory, saveDashboardResourceSample } from '@/features/dashboard/dashboard-resource-api'
import { fetchConnections, testConnection, toForm, type SgbdConnection } from '@/features/sgbd/sgbd-api'
import { useSettings } from '@/features/settings/settings-provider'
import {
  fetchHealth,
  fetchInstalledTools,
  fetchMachineInfo,
  fetchTerminalTabs,
  type MachineInfo,
} from '@/lib/api'

export type DashboardCardId = 'containers' | 'connections' | 'consoles'
export type DashboardRefreshStatus = 'refreshing' | 'operational' | 'warning'
export type DashboardResourceRange = 5 | 15 | 30
export type DashboardActivityKind = ActivityKind
export type DashboardActivityTone = ActivityTone

export type DashboardSummary = {
  value: string
  detail: string
  progress: number | null
}

export type DashboardConnection = {
  connection: SgbdConnection
  connected: boolean
  pingMs: number | null
  requiresManualPing: boolean
}

export type DashboardResourceSample = {
  at: string
  memory: number
  disk: number | null
}

export type DashboardResources = {
  memory: number | null
  disk: number | null
  memoryDetail: string
  diskDetail: string
  history: DashboardResourceSample[]
}

export type DashboardActivity = ActivityLog

export type DashboardSnapshot = {
  summaries: Record<DashboardCardId, DashboardSummary>
  resources: DashboardResources
  containers: DockerContainer[]
  connections: DashboardConnection[]
  machine: MachineInfo | null
  tools: string[]
  activities: ActivityLog[]
  apiOnline: boolean | null
  issues?: string[]
}

const EMPTY_SUMMARIES: Record<DashboardCardId, DashboardSummary> = {
  containers: { value: '—', detail: '', progress: null },
  connections: { value: '—', detail: '', progress: null },
  consoles: { value: '—', detail: '', progress: null },
}

const EMPTY_RESOURCES: DashboardResources = {
  memory: null,
  disk: null,
  memoryDetail: 'Indisponível',
  diskDetail: 'Indisponível',
  history: [],
}

const RESOURCE_HISTORY_SIZE = 31
const RESOURCE_RANGE_STORAGE_KEY = 'godard-stack.dashboard-resource-range'
const SNAPSHOT_STORAGE_KEY = 'godard-stack.dashboard-snapshot'

function savedResourceRange(): DashboardResourceRange {
  try {
    const value = Number(localStorage.getItem(RESOURCE_RANGE_STORAGE_KEY))
    return value === 5 || value === 15 || value === 30 ? value : 5
  } catch {
    return 5
  }
}

function savedSnapshot(): DashboardSnapshot | null {
  try {
    const content = localStorage.getItem(SNAPSHOT_STORAGE_KEY)
    if (content === null) {
      return null
    }
    const snapshot = JSON.parse(content) as Partial<DashboardSnapshot>
    return snapshot.summaries !== undefined
      && snapshot.resources !== undefined
      && Array.isArray(snapshot.containers)
      && Array.isArray(snapshot.connections)
      && Array.isArray(snapshot.tools)
      && Array.isArray(snapshot.activities)
      ? snapshot as DashboardSnapshot
      : null
  } catch {
    return null
  }
}

function saveSnapshotLocally(snapshot: DashboardSnapshot) {
  try {
    localStorage.setItem(SNAPSHOT_STORAGE_KEY, JSON.stringify(snapshot))
  } catch {
    // O snapshot remoto segue disponível quando o armazenamento local está bloqueado.
  }
}

function percentage(used: number, total: number) {
  return total > 0 ? Math.round((used / total) * 100) : null
}

function bytes(value: number) {
  return `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(value / (1024 ** 3))} GB`
}

function timestamp() {
  return new Date().toISOString()
}

function isOperational(result: Awaited<ReturnType<typeof fetchHealth>>) {
  return result.kind === 'report'
    && result.report.database === 'ok'
    && result.report.storage === 'ok'
    && result.report.agent === 'online'
    && result.report.shell !== 'fail'
}

export function useDashboardRefresh(active: boolean) {
  const { refreshInterval } = useSettings()
  const [cachedSnapshot] = useState<DashboardSnapshot | null>(savedSnapshot)
  const [summaries, setSummaries] = useState(() => cachedSnapshot?.summaries ?? EMPTY_SUMMARIES)
  const [resources, setResources] = useState(() => cachedSnapshot?.resources ?? EMPTY_RESOURCES)
  const [containers, setContainers] = useState<DockerContainer[]>(() => cachedSnapshot?.containers ?? [])
  const [connections, setConnections] = useState<DashboardConnection[]>(() => cachedSnapshot?.connections ?? [])
  const [machine, setMachine] = useState<MachineInfo | null>(() => cachedSnapshot?.machine ?? null)
  const [tools, setTools] = useState<string[]>(() => cachedSnapshot?.tools ?? [])
  const [activities, setActivities] = useState<ActivityLog[]>(() => cachedSnapshot?.activities ?? [])
  const [resourceRange, setResourceRangeState] = useState<DashboardResourceRange>(savedResourceRange)
  const [status, setStatus] = useState<DashboardRefreshStatus>(() => cachedSnapshot === null ? 'refreshing' : 'operational')
  const [apiOnline, setApiOnline] = useState<boolean | null>(() => cachedSnapshot?.apiOnline ?? null)
  const [issues, setIssues] = useState<string[]>(() => cachedSnapshot?.issues ?? [])
  const [institutionalBannerVisible, setInstitutionalBannerVisible] = useState(false)
  const [scheduleVersion, setScheduleVersion] = useState(0)
  const [snapshotLoaded, setSnapshotLoaded] = useState(false)
  const refreshPromise = useRef<Promise<void> | null>(null)
  const snapshotWrite = useRef<Promise<void>>(Promise.resolve())
  const previousContainers = useRef<Map<string, boolean> | null>(cachedSnapshot ? new Map(cachedSnapshot.containers.map((container) => [container.name, container.running])) : null)
  const previousConnections = useRef<Map<number, boolean> | null>(cachedSnapshot ? new Map(cachedSnapshot.connections.map(({ connection, connected }) => [connection.id, connected])) : null)

  const applySnapshot = useCallback((snapshot: DashboardSnapshot) => {
    setSummaries(snapshot.summaries)
    setResources(snapshot.resources)
    setContainers(snapshot.containers)
    setConnections(snapshot.connections)
    setMachine(snapshot.machine)
    setTools(snapshot.tools)
    setActivities(snapshot.activities)
    setApiOnline(snapshot.apiOnline)
    setIssues(snapshot.issues ?? [])
    setStatus(snapshot.apiOnline === false ? 'warning' : 'operational')
    previousContainers.current = new Map(snapshot.containers.map((container) => [container.name, container.running]))
    previousConnections.current = new Map(snapshot.connections.map(({ connection, connected }) => [connection.id, connected]))
  }, [])

  useEffect(() => {
    let cancelled = false

    void fetchDashboardSnapshot<DashboardSnapshot>()
      .then((snapshot) => {
        if (cancelled || snapshot === null || cachedSnapshot !== null) {
          return
        }
        applySnapshot(snapshot)
        saveSnapshotLocally(snapshot)
      })
      .catch(() => {
        // O cache local, quando disponível, mantém a dashboard útil sem o snapshot remoto.
      })
      .finally(() => {
        if (!cancelled) {
          setSnapshotLoaded(true)
        }
      })

    return () => {
      cancelled = true
    }
  }, [applySnapshot, cachedSnapshot])

  const persistSnapshot = useCallback((snapshot: DashboardSnapshot) => {
    saveSnapshotLocally(snapshot)
    snapshotWrite.current = snapshotWrite.current
      .catch(() => undefined)
      .then(() => saveDashboardSnapshot(snapshot))
      .catch(() => undefined)
  }, [])

  const refreshInstitutionalBanner = useCallback(async () => {
    try {
      setInstitutionalBannerVisible((await fetchInstitutionalBanner()).visible)
    } catch {
      // A indisponibilidade da faixa não interfere no acompanhamento do ambiente.
    }
  }, [])

  const loadResourceHistory = useCallback(async () => {
    try {
      const history = await fetchDashboardResourceHistory(30)
      if (history.length > 0) {
        setResources((current) => ({ ...current, history }))
      }
    } catch {
      // O snapshot preserva o último gráfico quando o histórico local não está disponível.
    }
  }, [])

  const reloadActivities = useCallback(async () => {
    try {
      const items = (await fetchActivities({ size: 5 })).items
      setActivities(items)
    } catch {
      // A sincronização dos indicadores segue funcionando quando o histórico está indisponível.
    }
  }, [])

  const addActivities = useCallback((events: Omit<ActivityLog, 'id' | 'createdAt'>[]) => {
    if (events.length === 0) {
      return
    }
    Promise.all(events.map(recordActivity)).then(reloadActivities).catch(() => undefined)
  }, [reloadActivities])

  const refresh = useCallback(() => {
    if (refreshPromise.current) {
      return refreshPromise.current
    }

    const task = (async () => {
      let completed = true
      const nextIssues: string[] = []
      setStatus('refreshing')

      try {
        const list = await fetchContainers()
        setContainers(list)
        setSummaries((current) => ({
          ...current,
          containers: {
            value: `${list.filter((container) => container.running).length} de ${list.length}`,
            detail: 'em execução',
            progress: list.length === 0 ? null : Math.round((list.filter((container) => container.running).length / list.length) * 100),
          },
        }))
        const previous = previousContainers.current
        const changes: Omit<ActivityLog, 'id' | 'createdAt'>[] = []
        if (previous !== null) {
          for (const container of list) {
            const wasRunning = previous.get(container.name)
            if (wasRunning === undefined && container.running) {
              changes.push({ kind: 'container', message: `Contêiner “${container.name}” iniciado`, tone: 'success' })
            } else if (wasRunning === false && container.running) {
              changes.push({ kind: 'container', message: `Contêiner “${container.name}” iniciado`, tone: 'success' })
            } else if (wasRunning === true && !container.running) {
              changes.push({ kind: 'container', message: `Contêiner “${container.name}” parado`, tone: 'warning' })
            }
          }
        }
        previousContainers.current = new Map(list.map((container) => [container.name, container.running]))
        addActivities(changes)
      } catch {
        completed = false
        nextIssues.push('Não foi possível atualizar contêineres')
        addActivities([{ kind: 'container', message: 'Não foi possível atualizar contêineres', tone: 'warning' }])
      }

      try {
        const list = await fetchConnections()
        const checked: DashboardConnection[] = []
        for (const connection of list) {
          if (!connection.autoPing) {
            checked.push({ connection, connected: false, pingMs: null, requiresManualPing: false })
            continue
          }
          if (connection.autoPingFailures >= 3) {
            checked.push({ connection, connected: false, pingMs: null, requiresManualPing: true })
            nextIssues.push(`Conexão “${connection.name}” requer verificação manual`)
            continue
          }
          try {
            const health = await testConnection(toForm(connection), connection.id, true)
            checked.push({
              connection: { ...connection, autoPingFailures: 0 },
              connected: true,
              pingMs: health.pingMs,
              requiresManualPing: false,
            })
          } catch {
            const autoPingFailures = Math.min(connection.autoPingFailures + 1, 3)
            const requiresManualPing = autoPingFailures >= 3
            checked.push({
              connection: { ...connection, autoPingFailures },
              connected: false,
              pingMs: null,
              requiresManualPing,
            })
            nextIssues.push(requiresManualPing
              ? `Conexão “${connection.name}” requer verificação manual`
              : `Conexão “${connection.name}” indisponível`)
          }
        }
        setConnections(checked)
        const monitored = checked.filter(({ connection }) => connection.autoPing)
        const connected = monitored.filter((item) => item.connected).length
        setSummaries((current) => ({
          ...current,
          connections: {
            value: String(checked.length),
            detail: monitored.length === 0 ? 'sem ping automático' : `${connected} online de ${monitored.length}`,
            progress: monitored.length === 0 ? null : Math.round((connected / monitored.length) * 100),
          },
        }))
        const previous = previousConnections.current
        const changes = previous === null ? [] : monitored.flatMap(({ connection, connected: isConnected }) => {
          const wasConnected = previous.get(connection.id)
          if (wasConnected === undefined || wasConnected !== isConnected) {
            return [{
              kind: 'connection' as const,
              message: `Conexão “${connection.name}” ${isConnected ? 'conectada' : 'indisponível'}`,
              tone: (isConnected ? 'primary' : 'warning') as DashboardActivityTone,
            }]
          }
          return []
        })
        previousConnections.current = new Map(monitored.map(({ connection, connected: isConnected }) => [connection.id, isConnected]))
        addActivities(changes)
        if (connected !== monitored.length) {
          completed = false
        }
      } catch {
        completed = false
        nextIssues.push('Não foi possível atualizar conexões')
        addActivities([{ kind: 'connection', message: 'Não foi possível atualizar conexões', tone: 'warning' }])
      }

      try {
        const tabs = await fetchTerminalTabs()
        setSummaries((current) => ({
          ...current,
          consoles: { value: String(tabs.length), detail: tabs.length === 1 ? 'aberto' : 'abertos', progress: null },
        }))
      } catch {
        completed = false
        nextIssues.push('Não foi possível atualizar consoles')
      }

      try {
        const machine = await fetchMachineInfo()
        if (machine === null) {
          throw new Error('Dados da máquina indisponíveis')
        }
        setMachine(machine)
        const memoryUsed = machine.memoryTotal - machine.memoryAvailable
        const diskUsed = machine.diskTotal === undefined || machine.diskAvailable === undefined
          ? null
          : machine.diskTotal - machine.diskAvailable
        const sample = {
          at: timestamp(),
          memory: percentage(memoryUsed, machine.memoryTotal) ?? 0,
          disk: diskUsed === null || machine.diskTotal === undefined ? null : percentage(diskUsed, machine.diskTotal),
        }
        setResources((current) => ({
          memory: sample.memory,
          disk: sample.disk,
          memoryDetail: `${bytes(memoryUsed)} / ${bytes(machine.memoryTotal)}`,
          diskDetail: diskUsed === null || machine.diskTotal === undefined ? 'Indisponível' : `${bytes(diskUsed)} / ${bytes(machine.diskTotal)}`,
          history: current.history.concat(sample).slice(-RESOURCE_HISTORY_SIZE),
        }))
        void saveDashboardResourceSample(sample.memory, sample.disk).catch(() => undefined)
      } catch {
        completed = false
        nextIssues.push('Não foi possível atualizar dados da máquina')
        setMachine(null)
        addActivities([{ kind: 'system', message: 'Não foi possível atualizar recursos', tone: 'warning' }])
      }

      try {
        setTools(await fetchInstalledTools())
      } catch {
        completed = false
        nextIssues.push('Não foi possível atualizar ferramentas')
        setTools([])
      }

      await refreshInstitutionalBanner()

      const health = await fetchHealth()
      setApiOnline(health.kind !== 'unreachable')
      if (health.kind === 'unreachable') {
        nextIssues.push('API do Godard Stack indisponível')
      } else if (health.kind === 'forbidden') {
        nextIssues.push('Acesso à API não autorizado')
      } else {
        if (health.report.database !== 'ok') {
          nextIssues.push('Banco local indisponível')
        }
        if (health.report.storage !== 'ok') {
          nextIssues.push('Armazenamento local indisponível')
        }
        if (health.report.agent !== 'online') {
          nextIssues.push('Agente local indisponível')
        }
        if (health.report.shell === 'fail') {
          nextIssues.push('Shell do agente indisponível')
        }
      }
      setIssues([...new Set(nextIssues)])
      setStatus(completed && isOperational(health) ? 'operational' : 'warning')
    })()

    refreshPromise.current = task.finally(() => {
      refreshPromise.current = null
    })
    return refreshPromise.current
  }, [addActivities, refreshInstitutionalBanner])

  const refreshNow = useCallback(() => {
    setScheduleVersion((current) => current + 1)
    return refresh()
  }, [refresh])

  const dismissBanner = useCallback(async () => {
    await dismissInstitutionalBanner()
    setInstitutionalBannerVisible(false)
  }, [])

  const setResourceRange = useCallback((range: DashboardResourceRange) => {
    setResourceRangeState(range)
    try {
      localStorage.setItem(RESOURCE_RANGE_STORAGE_KEY, String(range))
    } catch {
      // A seleção segue disponível durante a sessão quando o armazenamento está bloqueado.
    }
  }, [])

  useEffect(() => {
    if (!active || !snapshotLoaded) {
      return
    }
    void loadResourceHistory()
    void reloadActivities().then(refresh)
    if (refreshInterval === 0) {
      return
    }
    const timer = setInterval(refresh, refreshInterval)
    return () => clearInterval(timer)
  }, [active, loadResourceHistory, refresh, refreshInterval, reloadActivities, scheduleVersion, snapshotLoaded])

  useEffect(() => {
    if (active && snapshotLoaded) {
      void refreshInstitutionalBanner()
    }
  }, [active, refreshInstitutionalBanner, snapshotLoaded])

  useEffect(() => {
    if (!snapshotLoaded || summaries.containers.value === '—') {
      return
    }

    const snapshot: DashboardSnapshot = {
      summaries,
      resources,
      containers,
      connections,
      machine,
      tools,
      activities,
      apiOnline,
      issues,
    }
    persistSnapshot(snapshot)
  }, [activities, apiOnline, connections, containers, issues, machine, persistSnapshot, resources, snapshotLoaded, summaries, tools])

  return { summaries, resources, containers, connections, machine, tools, activities, reloadActivities, resourceRange, setResourceRange, status, apiOnline, issues, institutionalBannerVisible, dismissBanner, refresh, refreshNow }
}

export type DashboardRefresh = ReturnType<typeof useDashboardRefresh>
