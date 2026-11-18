import { api } from '@/lib/http'

const ACTIVITIES_URL = '/api/activities'

export type ActivityKind = 'container' | 'connection' | 'console' | 'command' | 'system'
export type ActivityTone = 'success' | 'primary' | 'muted' | 'warning'

export type ActivityLog = {
  id: number
  kind: ActivityKind
  tone: ActivityTone
  message: string
  createdAt: string
}

export type ActivityPage = {
  items: ActivityLog[]
  total: number
}

export type ActivityPageSize = 5 | 10 | 25 | 50

export function fetchActivities({ query = '', page = 0, size = 10 }: { query?: string; page?: number; size?: ActivityPageSize } = {}) {
  const qs = new URLSearchParams({ query, page: String(page), size: String(size) })
  return api.get(`${ACTIVITIES_URL}?${qs}`).json<ActivityPage>('Falha ao consultar atividades')
}

export function recordActivity(activity: Omit<ActivityLog, 'id' | 'createdAt'>) {
  return api.post(ACTIVITIES_URL).form({ kind: activity.kind, tone: activity.tone, message: activity.message }).send('Falha ao registrar atividade')
}

export function clearActivities() {
  return api.del(ACTIVITIES_URL).send('Falha ao limpar atividades')
}
