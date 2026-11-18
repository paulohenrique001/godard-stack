import { useEffect, useState } from 'react'
import {
  createSavedCommand,
  deleteSavedCommand,
  fetchSavedCommands,
  updateSavedCommand,
  type SavedCommand,
} from '@/lib/api'

export function useSavedCommands() {
  const [commands, setCommands] = useState<SavedCommand[]>([])

  const apply = (request: Promise<SavedCommand[]>) => {
    request.then(setCommands).catch(() => undefined)
  }

  useEffect(() => {
    apply(fetchSavedCommands())
  }, [])

  return {
    commands,
    createCommand: (command: string) => apply(createSavedCommand(command)),
    updateCommand: (id: number, command: string) => apply(updateSavedCommand(id, command)),
    deleteCommand: (id: number) => apply(deleteSavedCommand(id)),
  }
}
