import { DEFAULT_PAGE, toPage, type Page } from '@/features/layout/pages'

const PAGE_STORAGE_KEY = 'godard-stack.current-page'

export function pageForCurrentTab(): Page {
  try {
    return toPage(sessionStorage.getItem(PAGE_STORAGE_KEY))
  } catch {
    return DEFAULT_PAGE
  }
}

export function savePageForCurrentTab(page: Page) {
  try {
    sessionStorage.setItem(PAGE_STORAGE_KEY, page)
  } catch {
    // A página continua navegável quando o armazenamento do navegador está bloqueado.
  }
}
