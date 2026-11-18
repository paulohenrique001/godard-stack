import { useCallback, useEffect, useState } from 'react'
import {
  activateTerminalTab,
  createTerminalTab,
  deleteTerminalTab,
  fetchTerminalTabs,
  renameTerminalTab,
  type RuntimeStatus,
  type TerminalTabRecord,
} from '../../api'
import type { TerminalStatus, TerminalTab } from './types'

export const MAX_TAB_NAME_LENGTH = 15

export const tabTitle = (tab: TerminalTab) => tab.name ?? `console ${tab.number}`

export function useTerminalTabs(runtime: RuntimeStatus) {
  const [tabs, setTabs] = useState<TerminalTab[]>([])
  const [loaded, setLoaded] = useState(false)
  const [persistenceError, setPersistenceError] = useState<string | null>(null)

  const reportPersistenceError = useCallback((message: string) => {
    setPersistenceError(message)
  }, [])

  const clearPersistenceError = useCallback(() => {
    setPersistenceError(null)
  }, [])

  const applyRecords = useCallback((records: TerminalTabRecord[]) => {
    setTabs((current) =>
      records.map((record) => {
        const known = current.find((tab) => tab.id === record.id)
        return {
          ...record,
          alive: record.alive || (known?.alive ?? false),
          status: known?.status ?? (record.alive ? 'connected' : 'idle'),
        }
      }),
    )
  }, [])

  useEffect(() => {
    let active = true
    setLoaded(false)
    fetchTerminalTabs(runtime)
      .then((records) => {
        if (active) {
          applyRecords(records)
          setLoaded(true)
        }
      })
      .catch(() => {
        if (active) {
          reportPersistenceError('Não foi possível recuperar os consoles salvos.')
          setLoaded(true)
        }
      })
    return () => {
      active = false
    }
  }, [applyRecords, reportPersistenceError, runtime])

  const addTab = useCallback(async () => {
    try {
      applyRecords(await createTerminalTab(runtime))
    } catch {
      reportPersistenceError('Não foi possível criar o console.')
    }
  }, [applyRecords, reportPersistenceError, runtime])

  const closeTab = useCallback(
    (id: number) => {
      deleteTerminalTab(runtime, id)
        .then(applyRecords)
        .catch(() => reportPersistenceError('Não foi possível remover o console.'))
    },
    [applyRecords, reportPersistenceError, runtime],
  )

  const selectTab = useCallback(
    (id: number) => {
      setTabs((current) => current.map((tab) => ({ ...tab, active: tab.id === id })))
      activateTerminalTab(runtime, id).catch(() => {
        reportPersistenceError('Não foi possível salvar o console selecionado.')
        fetchTerminalTabs(runtime)
          .then(applyRecords)
          .catch(() => undefined)
      })
    },
    [applyRecords, reportPersistenceError, runtime],
  )

  const renameTab = useCallback(
    (id: number, name: string) => {
      setTabs((current) => current.map((tab) => (tab.id === id ? { ...tab, name } : tab)))
      renameTerminalTab(runtime, id, name)
        .catch(() => fetchTerminalTabs(runtime).then(applyRecords))
        .catch(() => reportPersistenceError('Não foi possível salvar o nome do console.'))
    },
    [applyRecords, reportPersistenceError, runtime],
  )

  const setTabStatus = useCallback((id: number, status: TerminalStatus) => {
    setTabs((current) => current.map((tab) => (tab.id === id ? { ...tab, status } : tab)))
  }, [])

  return {
    tabs,
    loaded,
    persistenceError,
    selectTab,
    addTab,
    closeTab,
    renameTab,
    setTabStatus,
    reportPersistenceError,
    clearPersistenceError,
  }
}
