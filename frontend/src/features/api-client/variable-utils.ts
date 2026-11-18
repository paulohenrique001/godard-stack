import type { ApiClientVariable } from '../../api'

export function resolveVariables(text: string, variables: ApiClientVariable[]): string {
  if (!text || variables.length === 0) return text
  return text.replace(/\{\{([^}]+)\}\}/g, (match, name) => {
    const v = variables.find((v) => v.name === name.trim())
    return v !== undefined ? v.value : match
  })
}

export function extractVariableNames(text: string): string[] {
  const matches = text.matchAll(/\{\{([^}]+)\}\}/g)
  return [...matches].map((m) => m[1].trim()).filter(Boolean)
}

export function hasUnresolved(text: string, variables: ApiClientVariable[]): boolean {
  const names = extractVariableNames(text)
  if (names.length === 0) return false
  return names.some((n) => !variables.find((v) => v.name === n))
}
