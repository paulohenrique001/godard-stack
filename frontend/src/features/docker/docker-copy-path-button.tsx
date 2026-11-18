import { useState } from 'react'
import { LuCheck, LuFile } from 'react-icons/lu'

const COPIED_FEEDBACK_MS = 1_500

export function DockerCopyPathButton({ path }: { path: string }) {
  const [copied, setCopied] = useState(false)

  const copy = () => {
    void navigator.clipboard
      .writeText(path)
      .then(() => {
        setCopied(true)
        window.setTimeout(() => setCopied(false), COPIED_FEEDBACK_MS)
      })
      .catch(() => undefined)
  }

  return (
    <button
      type="button"
      aria-label="Copiar caminho"
      title={path}
      className="flex min-w-0 items-center gap-1.5 rounded-sm text-xs text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
      onClick={copy}
    >
      {copied ? (
        <LuCheck className="size-3.5 shrink-0 text-success" />
      ) : (
        <LuFile className="size-3.5 shrink-0" />
      )}
      <span className="truncate">{path}</span>
    </button>
  )
}
