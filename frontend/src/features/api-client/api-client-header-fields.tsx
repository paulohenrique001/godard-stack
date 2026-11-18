import { LuPlus, LuTrash2 } from 'react-icons/lu'
import type { ApiClientHeader, ApiClientVariable } from '../../api'
import { VariableInput } from './variable-input'

type ApiClientHeaderFieldsProps = {
  headers: ApiClientHeader[]
  disabled: boolean
  onChange: (headers: ApiClientHeader[]) => void
  variables?: ApiClientVariable[]
  onCreateVariable?: (name: string) => void
}

export function ApiClientHeaderFields({ headers, disabled, onChange, variables = [], onCreateVariable }: ApiClientHeaderFieldsProps) {
  const update = (index: number, field: keyof ApiClientHeader, value: string) => {
    onChange(
      headers.map((header, currentIndex) =>
        currentIndex === index ? { ...header, [field]: value } : header,
      ),
    )
  }

  const remove = (index: number) => {
    onChange(headers.filter((_, currentIndex) => currentIndex !== index))
  }

  return (
    <section className="p-5" aria-labelledby="request-headers">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 id="request-headers" className="font-semibold">
            Headers
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Autorização, tipo de conteúdo e metadados da requisição.
          </p>
        </div>
        <button
          type="button"
          disabled={disabled || headers.length >= 30}
          className="inline-flex h-9 shrink-0 items-center gap-2 rounded-lg border bg-card px-3 text-sm font-medium transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-50"
          onClick={() => onChange([...headers, { name: '', value: '' }])}
        >
          <LuPlus className="size-4" />
          Adicionar
        </button>
      </div>

      {headers.length === 0 ? (
        <p className="mt-5 rounded-lg border border-dashed px-3 py-4 text-sm text-muted-foreground">
          Nenhum header adicional.
        </p>
      ) : (
        <div className="mt-5 space-y-2">
          {headers.map((header, index) => (
            <div key={index} className="flex min-w-0 items-center gap-2">
              <label className="sr-only" htmlFor={`api-header-name-${index}`}>
                Nome do header {index + 1}
              </label>
              <input
                id={`api-header-name-${index}`}
                value={header.name}
                disabled={disabled}
                autoComplete="off"
                placeholder="Nome"
                className="field-input min-w-0 flex-1"
                onChange={(event) => update(index, 'name', event.target.value)}
              />
              <label className="sr-only" htmlFor={`api-header-value-${index}`}>
                Valor do header {index + 1}
              </label>
              <VariableInput
                id={`api-header-value-${index}`}
                value={header.value}
                disabled={disabled}
                autoComplete="off"
                placeholder="Valor"
                className="field-input min-w-0 flex-[1.5]"
                variables={variables}
                onChange={(value) => update(index, 'value', value)}
                onCreateVariable={onCreateVariable}
              />
              <button
                type="button"
                aria-label={`Remover header ${index + 1}`}
                disabled={disabled}
                className="grid size-10 shrink-0 place-items-center rounded-lg border text-muted-foreground transition-colors hover:border-destructive hover:text-destructive disabled:pointer-events-none disabled:opacity-50"
                onClick={() => remove(index)}
              >
                <LuTrash2 className="size-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
