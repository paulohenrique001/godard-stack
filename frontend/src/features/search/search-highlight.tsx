import { normalizeText } from '@/features/search/search-catalog'

export function SearchHighlight({ text, query }: { text: string; query: string }) {
  const term = normalizeText(query.trim())
  const start = term ? normalizeText(text).indexOf(term) : -1
  if (start < 0) {
    return <>{text}</>
  }
  const end = start + term.length

  return (
    <>
      {text.slice(0, start)}
      <span className="text-highlight group-data-[selected=true]:text-primary-foreground group-data-[selected=true]:underline">
        {text.slice(start, end)}
      </span>
      {text.slice(end)}
    </>
  )
}
