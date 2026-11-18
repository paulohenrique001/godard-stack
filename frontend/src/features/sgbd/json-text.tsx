const JSON_TOKEN = /("(?:[^"\\]|\\.)*")(\s*:)?|\b(?:true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g

const tokenClass = (token: string, isKey: boolean) => {
  if (isKey) {
    return 'font-semibold text-highlight'
  }
  return token.startsWith('"') ? 'text-success' : 'text-warning'
}

export function JsonText({ text }: { text: string }) {
  const parts = []
  let position = 0
  for (const match of text.matchAll(JSON_TOKEN)) {
    const token = match[1] ?? match[0]
    parts.push(text.slice(position, match.index))
    parts.push(
      <span key={match.index} className={tokenClass(token, match[2] !== undefined)}>
        {token}
      </span>,
    )
    position = match.index + token.length
  }
  parts.push(text.slice(position))
  return parts
}
