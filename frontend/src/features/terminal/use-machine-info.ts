import { useEffect, useState } from 'react'
import { useSettings } from '@/features/settings/settings-provider'
import { fetchMachineInfo, type MachineInfo } from '@/lib/api'

export function useMachineInfo() {
  const { refreshInterval } = useSettings()
  const [info, setInfo] = useState<MachineInfo | null>(null)

  useEffect(() => {
    let cancelled = false

    const refresh = async () => {
      const result = await fetchMachineInfo()
      if (!cancelled) {
        setInfo(result)
      }
    }

    refresh()
    if (refreshInterval === 0) {
      return () => {
        cancelled = true
      }
    }
    const timer = setInterval(refresh, refreshInterval)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [refreshInterval])

  return info
}
