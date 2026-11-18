import { useCallback, useEffect, useState } from 'react'
import { fetchSearchHistory, updateSearchHistory, type SearchHistory, type SearchList } from '@/lib/api'

const EMPTY_HISTORY: SearchHistory = { favorites: [], recents: [] }

export function useSearchHistory() {
  const [history, setHistory] = useState(EMPTY_HISTORY)

  const reload = useCallback(() => fetchSearchHistory().then(setHistory).catch(() => undefined), [])

  useEffect(() => {
    reload()
  }, [reload])

  const update = useCallback(
    (list: SearchList, itemId: string, method: 'PUT' | 'DELETE') => {
      updateSearchHistory(list, itemId, method).then(reload).catch(reload)
    },
    [reload],
  )

  const addFavorite = (itemId: string) => {
    setHistory((current) => ({
      favorites: [...current.favorites, itemId],
      recents: current.recents.filter((id) => id !== itemId),
    }))
    update('favorites', itemId, 'PUT')
  }

  const removeFavorite = (itemId: string) => {
    setHistory((current) => ({ ...current, favorites: current.favorites.filter((id) => id !== itemId) }))
    update('favorites', itemId, 'DELETE')
  }

  const addRecent = (itemId: string) => {
    if (history.favorites.includes(itemId)) {
      return
    }
    setHistory((current) => ({
      ...current,
      recents: [itemId, ...current.recents.filter((id) => id !== itemId)],
    }))
    update('recents', itemId, 'PUT')
  }

  const removeRecent = (itemId: string) => {
    setHistory((current) => ({ ...current, recents: current.recents.filter((id) => id !== itemId) }))
    update('recents', itemId, 'DELETE')
  }

  return { history, addFavorite, removeFavorite, addRecent, removeRecent }
}
