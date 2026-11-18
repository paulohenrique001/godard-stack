import { api } from '@/lib/http'

const SNAPSHOT_URL = '/api/dashboard/snapshot'

export function fetchDashboardSnapshot<T>(): Promise<T | null> {
  return api.get(SNAPSHOT_URL).jsonOrNull<T>(204, 'Falha ao consultar o snapshot do dashboard')
}

export function saveDashboardSnapshot(snapshot: unknown) {
  return api.put(SNAPSHOT_URL).body(JSON.stringify(snapshot)).send('Falha ao salvar o snapshot do dashboard')
}
