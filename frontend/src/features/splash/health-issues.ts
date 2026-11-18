import type { HealthReport, HealthResult } from '@/lib/api'

export type HealthIssue = {
  title: string
  hint: string
  repairPath?: string
}

export type HealthIssues = {
  blockers: HealthIssue[]
  warnings: HealthIssue[]
}

export const BACKEND_OFFLINE: HealthIssue = {
  title: 'Serviço indisponível',
  hint: 'O backend não respondeu. Verifique se o container está no ar.',
}

const FORBIDDEN_ADDRESS: HealthIssue = {
  title: 'Endereço não autorizado',
  hint: 'Abra a aplicação em localhost, na porta definida em APP_PORT no .env.',
}

function reportIssues(report: HealthReport): HealthIssues {
  const blockers: HealthIssue[] = []
  const warnings: HealthIssue[] = []

  if (report.database === 'fail') {
    blockers.push({
      title: 'Banco de dados indisponível',
      hint: 'Não foi possível consultar o banco local. Confira os logs do container.',
    })
  }
  if (report.storage === 'fail') {
    blockers.push({
      title: 'Disco de dados sem acesso',
      hint: 'O volume de dados não permite escrita ou está sem espaço.',
    })
  }
  if (report.agent === 'offline') {
    blockers.push({
      title: 'Agente fora do ar',
      hint: 'Inicie o agente na máquina host.',
    })
  }
  if (report.agent === 'unauthorized') {
    blockers.push({
      title: 'Token do agente inválido',
      hint: 'O token usado pelo agente não confere com o AGENT_TOKEN do .env. Reinicie o agente e o container.',
    })
  }
  if (report.shell === 'fail') {
    blockers.push({
      title: 'Shell não encontrado',
      hint: 'O agente não encontrou um shell executável. Confira a variável SHELL do host.',
    })
  }
  const serviceFolderPath = report.serviceFolderPath ?? ''
  if (report.serviceFolder === 'missing') {
    blockers.push({
      title: 'Pasta de serviço não encontrada',
      hint: `A pasta ${serviceFolderPath} foi removida ou movida.`,
      repairPath: serviceFolderPath,
    })
  }
  if (report.serviceFolder === 'incomplete') {
    blockers.push({
      title: 'Pasta de serviço incompleta',
      hint: `Faltam arquivos em ${serviceFolderPath}.`,
      repairPath: serviceFolderPath,
    })
  }
  if (report.serviceFolder === 'denied') {
    blockers.push({
      title: 'Pasta de serviço sem acesso',
      hint: `Não foi possível gravar em ${serviceFolderPath}. Confira as permissões e o espaço em disco.`,
    })
  }
  if (report.agentUser === 'warn') {
    warnings.push({
      title: 'Agente rodando como administrador',
      hint: 'Use um usuário comum, porque o terminal herda esse acesso.',
    })
  }

  return { blockers, warnings }
}

export function healthIssues(result: HealthResult): HealthIssues {
  if (result.kind === 'unreachable') {
    return { blockers: [BACKEND_OFFLINE], warnings: [] }
  }
  if (result.kind === 'forbidden') {
    return { blockers: [FORBIDDEN_ADDRESS], warnings: [] }
  }
  return reportIssues(result.report)
}
