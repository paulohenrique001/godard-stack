import { useCallback, useEffect, useMemo, useState } from 'react'
import { fetchActivities, type ActivityLog } from '@/features/dashboard/activity-api'
import { useSettings } from '@/features/settings/settings-provider'

const STORAGE_KEY = 'godard-stack.notifications-last-read-id'
const NOTIFICATION_PAGE_SIZE = 25

function readLastReadId() {
  try {
    const value = Number(localStorage.getItem(STORAGE_KEY))
    return Number.isSafeInteger(value) && value >= 0 ? value : 0
  } catch {
    return 0
  }
}

function storeLastReadId(id: number) {
  try {
    localStorage.setItem(STORAGE_KEY, String(id))
  } catch {
    // A leitura continua válida enquanto esta aba estiver aberta.
  }
}

export function useNotifications() {
  const { refreshInterval } = useSettings()
  const [items, setItems] = useState<ActivityLog[]>([])
  const [lastReadId, setLastReadId] = useState(readLastReadId)
  const [loading, setLoading] = useState(true)
  const [unavailable, setUnavailable] = useState(false)

  const refresh = useCallback(async () => {
    try {
      const result = await fetchActivities({ size: NOTIFICATION_PAGE_SIZE })
      setItems(result.items)
      setUnavailable(false)
    } catch {
      setUnavailable(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
    if (refreshInterval === 0) {
      return
    }
    const timer = setInterval(() => { void refresh() }, refreshInterval)
    return () => clearInterval(timer)
  }, [refresh, refreshInterval])

  const markAllRead = useCallback(() => {
    const latest = items.reduce((highest, item) => Math.max(highest, item.id), lastReadId)
    setLastReadId(latest)
    storeLastReadId(latest)
  }, [items, lastReadId])

  const unreadCount = useMemo(() => items.filter((item) => item.id > lastReadId).length, [items, lastReadId])

  return { items, loading, unavailable, unreadCount, refresh, markAllRead }
}
