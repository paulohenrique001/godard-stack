import { useCallback, useEffect, useState } from 'react'
import type { TerminalStatus } from '@/features/terminal/terminal-view'
import {
  activateTerminalTab,
  createTerminalTab,
  deleteTerminalTab,
  fetchTerminalTabs,
  renameTerminalTab,
  type TerminalTabRecord,
} from '@/lib/api'

export type TerminalTab = TerminalTabRecord & {
  status: TerminalStatus
}

export const MAX_TAB_NAME_LENGTH = 15

export const tabTitle = (tab: TerminalTab) => tab.name ?? `console ${tab.number}`

export function useTerminalTabs() {
  const [tabs, setTabs] = useState<TerminalTab[]>([])
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
    fetchTerminalTabs()
      .then(applyRecords)
      .catch(() => reportPersistenceError('Não foi possível recuperar os consoles salvos.'))
  }, [applyRecords, reportPersistenceError])

  const addTab = useCallback(
    async () => {
      try {
        applyRecords(await createTerminalTab())
      } catch {
        reportPersistenceError('Não foi possível criar o console.')
      }
    },
    [applyRecords, reportPersistenceError],
  )

  const closeTab = (id: number) => {
    deleteTerminalTab(id)
      .then(applyRecords)
      .catch(() => reportPersistenceError('Não foi possível remover o console.'))
  }

  const selectTab = (id: number) => {
    setTabs((current) => current.map((tab) => ({ ...tab, active: tab.id === id })))
    activateTerminalTab(id).catch(() => {
      reportPersistenceError('Não foi possível salvar o console selecionado.')
      fetchTerminalTabs().then(applyRecords).catch(() => undefined)
    })
  }

  const renameTab = (id: number, name: string) => {
    setTabs((current) => current.map((tab) => (tab.id === id ? { ...tab, name } : tab)))
    renameTerminalTab(id, name)
      .catch(() => fetchTerminalTabs().then(applyRecords))
      .catch(() => reportPersistenceError('Não foi possível salvar o nome do console.'))
  }

  const setTabStatus = useCallback((id: number, status: TerminalStatus) => {
    setTabs((current) => current.map((tab) => (tab.id === id ? { ...tab, status } : tab)))
  }, [])

  return {
    tabs,
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
