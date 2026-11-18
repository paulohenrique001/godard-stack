import { useCallback, useEffect, useState } from 'react'
import {
  createSavedCommand,
  deleteSavedCommand,
  fetchSavedCommands,
  updateSavedCommand,
  type RuntimeStatus,
  type SavedCommand,
} from '../../api'

export function useSavedCommands(runtime: RuntimeStatus, enabled: boolean) {
  const [commands, setCommands] = useState<SavedCommand[]>([])

  const reload = useCallback(() => {
    if (!enabled) {
      setCommands([])
      return Promise.resolve()
    }
    return fetchSavedCommands(runtime)
      .then(setCommands)
      .catch(() => undefined)
  }, [enabled, runtime])

  useEffect(() => {
    void reload()
  }, [reload])

  const createCommand = useCallback(
    async (command: string) => {
      await createSavedCommand(runtime, command)
      await reload()
    },
    [reload, runtime],
  )

  const updateCommand = useCallback(
    async (id: number, command: string) => {
      await updateSavedCommand(runtime, id, command)
      await reload()
    },
    [reload, runtime],
  )

  const removeCommand = useCallback(
    async (id: number) => {
      await deleteSavedCommand(runtime, id)
      await reload()
    },
    [reload, runtime],
  )

  return { commands, createCommand, updateCommand, removeCommand }
}
