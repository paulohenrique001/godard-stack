import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  fetchDockerViewState,
  fetchContainerMetrics,
  fetchContainers,
  runContainerAction,
  saveDockerViewState,
  streamContainerUpdate,
  type ContainerAction,
  type DockerContainer,
  type DockerContainerMetrics,
  type DockerDetailTab,
} from '@/features/docker/docker-api'
import { useContainerFiles } from '@/features/docker/use-container-files'
import { useSettings } from '@/features/settings/settings-provider'

type ActionError = {
  id: string
  message: string
}

const MAX_UPDATE_OUTPUT_CHARS = 1_000_000
const UPDATE_OUTPUT_TRUNCATED = '\n\n[saída anterior removida para manter a aplicação responsiva]\n'

function appendUpdateOutput(current: string, next: string) {
  const output = current + next
  if (output.length <= MAX_UPDATE_OUTPUT_CHARS) {
    return output
  }
  return UPDATE_OUTPUT_TRUNCATED + output.slice(-(MAX_UPDATE_OUTPUT_CHARS - UPDATE_OUTPUT_TRUNCATED.length))
}

export type DockerContainers = ReturnType<typeof useDockerContainers>

export function useDockerContainers(active: boolean) {
  const { refreshInterval } = useSettings()
  const [containers, setContainers] = useState<DockerContainer[] | null>(null)
  const [unavailable, setUnavailable] = useState(false)
  const [selectedName, setSelectedName] = useState<string | null>(null)
  const [selectedTab, setSelectedTab] = useState<DockerDetailTab>('logs')
  const [showStopped, setShowStopped] = useState(true)
  const [query, setQuery] = useState('')
  const [pending, setPending] = useState<Record<string, ContainerAction>>({})
  const [actionError, setActionError] = useState<ActionError | null>(null)
  const [logsEpoch, setLogsEpoch] = useState(0)
  const [creating, setCreating] = useState(false)
  const [outputs, setOutputs] = useState<Record<string, string>>({})
  const [metrics, setMetrics] = useState<Record<string, DockerContainerMetrics>>({})
  const hasExplicitSelection = useRef(false)
  const files = useContainerFiles()

  useEffect(() => {
    let cancelled = false
    fetchDockerViewState()
      .then((state) => {
        if (!cancelled) {
          if (!hasExplicitSelection.current) {
            setSelectedName(state.containerName)
          }
          setSelectedTab(state.tab)
          setShowStopped(state.showStopped)
        }
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [])

  const refresh = useCallback(async () => {
    try {
      const list = await fetchContainers()
      setContainers(list)
      setUnavailable(false)
      return list
    } catch {
      setUnavailable(true)
      return []
    }
  }, [])

  useEffect(() => {
    if (!active) {
      return
    }
    refresh()
    if (refreshInterval === 0) {
      return
    }
    const timer = setInterval(refresh, refreshInterval)
    return () => clearInterval(timer)
  }, [active, refresh, refreshInterval])

  const visible = useMemo(() => {
    const term = query.trim().toLowerCase()
    return (containers ?? []).filter(
      (container) => (showStopped || container.running) && container.name.toLowerCase().includes(term),
    )
  }, [containers, query, showStopped])

  const selected = containers?.find((container) => container.name === selectedName) ?? null

  useEffect(() => {
    if (!active || !selected?.running) {
      return
    }
    let cancelled = false
    const load = async () => {
      try {
        const current = await fetchContainerMetrics(selected.id)
        if (!cancelled) setMetrics((previous) => ({ ...previous, [selected.id]: current }))
      } catch {
        // A tela continua útil quando as métricas do Docker não estão disponíveis.
      }
    }
    void load()
    if (refreshInterval === 0) {
      return () => {
        cancelled = true
      }
    }
    const timer = setInterval(load, refreshInterval)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [active, refreshInterval, selected])

  useEffect(() => {
    if (containers === null || selectedName === null || containers.some((container) => container.name === selectedName)) {
      return
    }
    setSelectedName(null)
    saveDockerViewState(null, selectedTab, showStopped).catch(() => undefined)
  }, [containers, selectedName, selectedTab, showStopped])

  const toggleShowStopped = useCallback(() => {
    const next = !showStopped
    setShowStopped(next)
    saveDockerViewState(selectedName, selectedTab, next).catch(() => undefined)
  }, [selectedName, selectedTab, showStopped])

  const runAction = useCallback(
    async ({ id }: DockerContainer, action: ContainerAction) => {
      setPending((current) => ({ ...current, [id]: action }))
      setActionError(null)
      try {
        await runContainerAction(id, action)
      } catch (error) {
        setActionError({ id, message: error instanceof Error ? error.message : 'Não foi possível concluir a ação.' })
      }
      await refresh()
      setPending(({ [id]: _finished, ...rest }) => rest)
      setLogsEpoch((epoch) => epoch + 1)
    },
    [refresh],
  )

  const updateContainer = useCallback(
    async ({ id, name }: DockerContainer) => {
      setPending((current) => ({ ...current, [id]: 'update' }))
      setActionError(null)
      setOutputs((current) => ({ ...current, [name]: '' }))
      try {
        const updated = await streamContainerUpdate(id, (text) => {
          setOutputs((current) => ({ ...current, [name]: appendUpdateOutput(current[name] ?? '', text) }))
        })
        if (!updated) {
          setActionError({ id, message: 'Não foi possível atualizar. Veja a aba Saída.' })
        }
      } catch {
        setActionError({ id, message: 'Não foi possível atualizar. Veja a aba Saída.' })
      } finally {
        await refresh()
        setPending(({ [id]: _finished, ...rest }) => rest)
        setLogsEpoch((epoch) => epoch + 1)
      }
    },
    [refresh],
  )

  const followRecreated = useCallback(
    async (matches: (container: DockerContainer) => boolean) => {
      const recreated = (await refresh()).find(matches)
      if (recreated) {
        setSelectedName(recreated.name)
        saveDockerViewState(recreated.name, selectedTab, showStopped).catch(() => undefined)
      }
      setLogsEpoch((epoch) => epoch + 1)
    },
    [refresh, selectedTab, showStopped],
  )

  const selectContainer = useCallback((id: string | null) => {
    const name = id === null ? null : containers?.find((container) => container.id === id)?.name ?? null
    hasExplicitSelection.current = true
    setSelectedName(name)
    setCreating(false)
    saveDockerViewState(name, selectedTab, showStopped).catch(() => undefined)
  }, [containers, selectedTab, showStopped])

  const selectContainerByName = useCallback((name: string) => {
    hasExplicitSelection.current = true
    setSelectedName(name)
    setCreating(false)
    saveDockerViewState(name, selectedTab, showStopped).catch(() => undefined)
  }, [selectedTab, showStopped])

  const selectTab = useCallback((tab: DockerDetailTab) => {
    setSelectedTab(tab)
    saveDockerViewState(selectedName, tab, showStopped).catch(() => undefined)
  }, [selectedName, showStopped])

  return {
    containers: containers ?? [],
    visible,
    selected,
    selectedTab,
    pending,
    query,
    showStopped,
    loading: containers === null,
    unavailable,
    actionError,
    logsEpoch,
    outputs,
    metrics: selected ? metrics[selected.id] ?? null : null,
    creating,
    files,
    setCreating,
    setQuery,
    selectContainer,
    selectContainerByName,
    selectTab,
    followRecreated,
    toggleShowStopped,
    runAction,
    updateContainer,
  }
}
