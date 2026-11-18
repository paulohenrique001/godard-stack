import type { IconType } from 'react-icons'
import { LuBell, LuBoxes, LuLink, LuSettings, LuSquareTerminal, LuSunMoon } from 'react-icons/lu'
import { PAGES, type Page } from '@/features/layout/pages'

export type SearchItem = {
  id: string
  title: string
  section: string
  icon: IconType
  run: () => void
}

type CatalogActions = {
  navigate: (page: Page) => void
  toggleTheme: () => void
  createConsole: () => void
  createContainer: () => void
  createConnection: () => void
  openNotifications: () => void
  openSettings: () => void
}

export function buildSearchCatalog({
  navigate,
  toggleTheme,
  createConsole,
  createContainer,
  createConnection,
  openNotifications,
  openSettings,
}: CatalogActions): SearchItem[] {
  return [
    ...PAGES.map((page) => ({
      id: `page-${page.id}`,
      title: page.title,
      section: 'Páginas',
      icon: page.icon,
      run: () => navigate(page.id),
    })),
    {
      id: 'action-toggle-theme',
      title: 'Alternar tema',
      section: 'Ações',
      icon: LuSunMoon,
      run: toggleTheme,
    },
    {
      id: 'action-create-console',
      title: 'Novo console',
      section: 'Ações',
      icon: LuSquareTerminal,
      run: createConsole,
    },
    {
      id: 'action-create-container',
      title: 'Novo contêiner',
      section: 'Ações',
      icon: LuBoxes,
      run: createContainer,
    },
    {
      id: 'action-create-connection',
      title: 'Nova conexão',
      section: 'Ações',
      icon: LuLink,
      run: createConnection,
    },
    {
      id: 'action-open-notifications',
      title: 'Abrir notificações',
      section: 'Ações',
      icon: LuBell,
      run: openNotifications,
    },
    {
      id: 'action-open-settings',
      title: 'Abrir configurações',
      section: 'Ações',
      icon: LuSettings,
      run: openSettings,
    },
  ]
}

export function normalizeText(text: string) {
  return text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
}

export function filterSearchItems(items: SearchItem[], query: string) {
  const term = normalizeText(query.trim())
  return items.filter((item) => normalizeText(item.title).includes(term))
}
