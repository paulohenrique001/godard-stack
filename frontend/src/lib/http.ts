type ParamValue = string | number | boolean | undefined

function buildParams(data: Record<string, ParamValue>): URLSearchParams {
  const body = new URLSearchParams()
  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined) body.set(key, String(value))
  }
  return body
}

async function readError(response: Response, msg: string): Promise<string> {
  const body = await response.text().catch(() => '')
  return body.trim() || `${msg} (${response.status})`
}

class Req {
  private _headers: Record<string, string> = {}
  private _body?: BodyInit

  constructor(private readonly _method: string, private readonly _url: string) {}

  form(data: URLSearchParams | Record<string, ParamValue>): this {
    this._body = data instanceof URLSearchParams ? data : buildParams(data)
    return this
  }

  body(text: string): this {
    this._headers['Content-Type'] = 'text/plain;charset=UTF-8'
    this._body = text
    return this
  }

  private async _do(): Promise<Response> {
    return fetch(this._url, { method: this._method, headers: this._headers, body: this._body })
  }

  private async _ok(response: Response, msg: string): Promise<Response> {
    if (!response.ok) throw new Error(await readError(response, msg))
    return response
  }

  async send(msg: string): Promise<void> {
    await this._ok(await this._do(), msg)
  }

  async text(msg: string): Promise<string> {
    return (await this._ok(await this._do(), msg)).text()
  }

  async json<T>(msg: string): Promise<T> {
    return (await this._ok(await this._do(), msg)).json()
  }

  async textOrNull(nullStatus: number, msg: string): Promise<string | null> {
    const response = await this._do()
    if (response.status === nullStatus) return null
    return (await this._ok(response, msg)).text()
  }

  async jsonOrNull<T>(nullStatus: number, msg: string): Promise<T | null> {
    const response = await this._do()
    if (response.status === nullStatus) return null
    return (await this._ok(response, msg)).json()
  }
}

export const api = {
  get: (url: string) => new Req('GET', url),
  post: (url: string) => new Req('POST', url),
  put: (url: string) => new Req('PUT', url),
  del: (url: string) => new Req('DELETE', url),
  request: (verb: string, url: string) => new Req(verb, url),
}

export function params(data: Record<string, ParamValue>): URLSearchParams {
  return buildParams(data)
}
