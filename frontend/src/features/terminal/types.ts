import type { TerminalTabRecord } from '../../api'

export type TerminalStatus = 'idle' | 'connecting' | 'connected' | 'disconnected'

export type TerminalTab = TerminalTabRecord & {
  status: TerminalStatus
}

export type CommandInsertion = {
  id: number
  command: string
}

export type TerminalMachine = {
  identity: string
}
