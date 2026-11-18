import type { ApiClientAuthentication, ApiClientVariable } from '../../api'
import { VariableInput } from './variable-input'

type ApiClientAuthFieldsProps = {
  authentication: ApiClientAuthentication
  disabled: boolean
  onChange: (authentication: ApiClientAuthentication) => void
  variables?: ApiClientVariable[]
  onCreateVariable?: (name: string) => void
}

export function ApiClientAuthFields({
  authentication,
  disabled,
  onChange,
  variables = [],
  onCreateVariable,
}: ApiClientAuthFieldsProps) {
  return (
    <div className="p-5">
      <label className="block max-w-sm text-sm font-medium" htmlFor="api-auth-type">
        Tipo de autenticação
        <select
          id="api-auth-type"
          value={authentication.type}
          disabled={disabled}
          className="field-input mt-2 appearance-none font-normal"
          onChange={(event) =>
            onChange({
              ...authentication,
              type: event.target.value as ApiClientAuthentication['type'],
            })
          }
        >
          <option value="none">Sem autenticação</option>
          <option value="bearer">Bearer Token</option>
          <option value="basic">Basic Auth</option>
        </select>
      </label>

      {authentication.type === 'bearer' && (
        <label className="mt-5 block max-w-2xl text-sm font-medium" htmlFor="api-auth-token">
          Token
          <VariableInput
            id="api-auth-token"
            value={authentication.token}
            disabled={disabled}
            autoComplete="off"
            placeholder="Cole o token Bearer"
            className="field-input mt-2 font-normal"
            variables={variables}
            onChange={(token) => onChange({ ...authentication, token })}
            onCreateVariable={onCreateVariable}
          />
          <span className="mt-2 block text-xs font-normal text-muted-foreground">
            O token é salvo criptografado somente nesta instalação.
          </span>
        </label>
      )}

      {authentication.type === 'basic' && (
        <div className="mt-5 grid max-w-2xl gap-4 sm:grid-cols-2">
          <label className="text-sm font-medium" htmlFor="api-auth-username">
            Usuário
            <VariableInput
              id="api-auth-username"
              value={authentication.username}
              disabled={disabled}
              autoComplete="off"
              className="field-input mt-2 font-normal"
              variables={variables}
              onChange={(username) => onChange({ ...authentication, username })}
              onCreateVariable={onCreateVariable}
            />
          </label>
          <label className="text-sm font-medium" htmlFor="api-auth-password">
            Senha
            <VariableInput
              id="api-auth-password"
              value={authentication.password}
              disabled={disabled}
              autoComplete="off"
              className="field-input mt-2 font-normal"
              variables={variables}
              onChange={(password) => onChange({ ...authentication, password })}
              onCreateVariable={onCreateVariable}
            />
          </label>
        </div>
      )}
    </div>
  )
}
