import type { IconType } from 'react-icons'
import {
  LuActivity,
  LuBoxes,
  LuClipboardCheck,
  LuDatabase,
  LuLayoutDashboard,
  LuSend,
  LuSettings,
  LuSquareTerminal,
} from 'react-icons/lu'
import type { Page } from '../../api'

export type PageItem = {
  id: Page
  title: string
  icon: IconType
}

export const SIDEBAR_PAGES: PageItem[] = [
  { id: 'dashboard', title: 'Visão geral', icon: LuLayoutDashboard },
  { id: 'todo', title: 'To-do', icon: LuClipboardCheck },
  { id: 'api-client', title: 'API Client', icon: LuSend },
  { id: 'docker', title: 'Contêineres', icon: LuBoxes },
  { id: 'sgbd', title: 'Bancos de dados', icon: LuDatabase },
  { id: 'terminal', title: 'Console', icon: LuSquareTerminal },
]

export const PAGES: PageItem[] = [
  ...SIDEBAR_PAGES,
  { id: 'activity', title: 'Atividades', icon: LuActivity },
  { id: 'settings', title: 'Configurações', icon: LuSettings },
]
