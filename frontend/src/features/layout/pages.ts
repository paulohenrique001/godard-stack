import type { IconType } from 'react-icons'
import { LuActivity, LuBoxes, LuDatabase, LuLayoutDashboard, LuNetwork, LuSettings, LuSquareTerminal, LuUser } from 'react-icons/lu'

export type Page = 'dashboard' | 'activity' | 'docker' | 'sgbd' | 'terminal' | 'http' | 'profile' | 'settings'

export const DEFAULT_PAGE: Page = 'dashboard'

type PageItem = { id: Page; title: string; icon: IconType }

export const SIDEBAR_PAGES: PageItem[] = [
  { id: 'dashboard', title: 'Visão geral', icon: LuLayoutDashboard },
  { id: 'docker', title: 'Contêineres', icon: LuBoxes },
  { id: 'sgbd', title: 'Bancos de dados', icon: LuDatabase },
  { id: 'terminal', title: 'Console', icon: LuSquareTerminal },
  { id: 'http', title: 'Cliente HTTP', icon: LuNetwork },
]

export const PAGES: PageItem[] = [
  ...SIDEBAR_PAGES,
  { id: 'activity', title: 'Atividades', icon: LuActivity },
  { id: 'profile', title: 'Perfil', icon: LuUser },
  { id: 'settings', title: 'Configurações', icon: LuSettings },
]

export const PAGES_WITHOUT_ASIDE = new Set<Page>(['http', 'profile', 'activity', 'settings'])

export function toPage(value: string | null): Page {
  return PAGES.find((page) => page.id === value)?.id ?? DEFAULT_PAGE
}
