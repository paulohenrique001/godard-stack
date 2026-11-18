import { api } from '@/lib/http'

const RESOURCE_HISTORY_URL = '/api/dashboard/resources'

export type DashboardResourcePoint = {
  at: string
  memory: number
  disk: number | null
}

export function fetchDashboardResourceHistory(minutes: number): Promise<DashboardResourcePoint[]> {
  return api.get(`${RESOURCE_HISTORY_URL}?minutes=${minutes}`).json('Falha ao consultar o histórico de recursos')
}

export function saveDashboardResourceSample(memory: number, disk: number | null) {
  return api.post(RESOURCE_HISTORY_URL).form({ memory, disk: disk ?? undefined }).send('Falha ao salvar o histórico de recursos')
}
