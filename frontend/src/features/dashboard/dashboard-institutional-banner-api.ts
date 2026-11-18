import { api } from '@/lib/http'

const BANNER_URL = '/api/dashboard/institutional-banner'

export function fetchInstitutionalBanner(): Promise<{ visible: boolean }> {
  return api.get(BANNER_URL).json('Falha ao consultar a faixa institucional')
}

export function dismissInstitutionalBanner() {
  return api.post(`${BANNER_URL}/dismiss`).send('Falha ao fechar a faixa institucional')
}
