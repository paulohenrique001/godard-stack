import { LuPlus, LuTrash2 } from 'react-icons/lu'
import type { ApiClientHeader, ApiClientVariable } from '../../api'
import { VariableInput } from './variable-input'

type ApiClientParameterFieldsProps = {
  url: string
  disabled: boolean
  onUrlChange: (url: string) => void
  variables?: ApiClientVariable[]
  onCreateVariable?: (name: string) => void
}

export function ApiClientParameterFields({
  url,
  disabled,
  onUrlChange,
  variables = [],
  onCreateVariable,
}: ApiClientParameterFieldsProps) {
  const parsed = parseUrl(url)
  const parameters = parsed?.parameters ?? []
  const editingDisabled = disabled || parsed === null

  const update = (index: number, field: keyof ApiClientHeader, value: string) => {
    if (!parsed) return
    const next = parameters.map((parameter, currentIndex) =>
      currentIndex === index ? { ...parameter, [field]: value } : parameter,
    )
    onUrlChange(withParameters(parsed.url, next))
  }

  const remove = (index: number) => {
    if (!parsed) return
    onUrlChange(
      withParameters(
        parsed.url,
        parameters.filter((_, currentIndex) => currentIndex !== index),
      ),
    )
  }

  const add = () => {
    if (!parsed) return
    onUrlChange(withParameters(parsed.url, [...parameters, { name: '', value: '' }]))
  }

  return (
    <section className="p-4" aria-labelledby="query-params-title">
      <h3 id="query-params-title" className="text-sm font-semibold">
        Query Params
      </h3>
      <div className="mt-3 overflow-x-auto rounded-lg border">
        <table className="w-full min-w-120 table-fixed border-collapse text-sm">
          <thead className="bg-muted/35 text-left text-xs text-muted-foreground">
            <tr>
              <th scope="col" className="w-[45%] border-b px-3 py-2.5 font-medium">
                Key
              </th>
              <th scope="col" className="border-b border-l px-3 py-2.5 font-medium">
                Value
              </th>
              <th scope="col" className="w-10 border-b border-l">
                <span className="sr-only">Ações</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {parameters.map((parameter, index) => (
              <tr key={`${parameter.name}-${index}`} className="group">
                <td className="border-b">
                  <label className="sr-only" htmlFor={`api-param-name-${index}`}>
                    Chave do parâmetro {index + 1}
                  </label>
                  <input
                    id={`api-param-name-${index}`}
                    value={parameter.name}
                    disabled={editingDisabled}
                    autoComplete="off"
                    placeholder="Key"
                    className="h-10 w-full bg-transparent px-3 outline-none transition-colors placeholder:text-muted-foreground/70 hover:bg-muted/50 focus-visible:bg-muted"
                    onChange={(event) => update(index, 'name', event.target.value)}
                  />
                </td>
                <td className="border-b border-l">
                  <label className="sr-only" htmlFor={`api-param-value-${index}`}>
                    Valor do parâmetro {index + 1}
                  </label>
                  <VariableInput
                    id={`api-param-value-${index}`}
                    value={parameter.value}
                    disabled={editingDisabled}
                    autoComplete="off"
                    placeholder="Value"
                    className="h-10 w-full bg-transparent px-3 outline-none transition-colors placeholder:text-muted-foreground/70 hover:bg-muted/50 focus-visible:bg-muted"
                    variables={variables}
                    onChange={(value) => update(index, 'value', value)}
                    onCreateVariable={onCreateVariable}
                  />
                </td>
                <td className="border-b border-l text-center">
                  <button
                    type="button"
                    aria-label={`Remover parâmetro ${index + 1}`}
                    disabled={editingDisabled}
                    className="grid size-8 place-items-center rounded-md text-muted-foreground opacity-0 transition-colors hover:bg-muted hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100 disabled:pointer-events-none"
                    onClick={() => remove(index)}
                  >
                    <LuTrash2 className="size-3.5" />
                  </button>
                </td>
              </tr>
            ))}
            <tr>
              <td colSpan={3}>
                <button
                  type="button"
                  aria-label="Adicionar parâmetro"
                  title={
                    parsed
                      ? 'Adicionar parâmetro'
                      : 'Informe uma URL HTTP para adicionar parâmetros'
                  }
                  disabled={editingDisabled}
                  className="grid h-10 w-full place-items-center text-muted-foreground transition-colors hover:bg-muted hover:text-highlight disabled:cursor-not-allowed disabled:opacity-40"
                  onClick={add}
                >
                  <LuPlus className="size-4" />
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      {!parsed && (
        <p className="mt-2 text-xs text-muted-foreground">
          Informe uma URL HTTP válida para adicionar parâmetros.
        </p>
      )}
    </section>
  )
}

function parseUrl(value: string) {
  try {
    const url = new URL(value)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    return {
      url,
      parameters: Array.from(url.searchParams.entries()).map(([name, parameterValue]) => ({
        name,
        value: parameterValue,
      })),
    }
  } catch {
    return null
  }
}

function withParameters(url: URL, parameters: ApiClientHeader[]) {
  const next = new URL(url.toString())
  next.search = ''
  for (const parameter of parameters) {
    if (parameter.name.trim()) next.searchParams.append(parameter.name.trim(), parameter.value)
  }
  return next.toString()
}
