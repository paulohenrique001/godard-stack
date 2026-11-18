import { useEffect, useRef, useState } from 'react'
import { LuEraser } from 'react-icons/lu'
import { FitAddon } from '@xterm/addon-fit'
import { SearchAddon } from '@xterm/addon-search'
import { Terminal } from '@xterm/xterm'
import '@xterm/xterm/css/xterm.css'
import { Button } from '@/components/ui/button'
import { FLOATING_BUTTON_CLASS, FloatingSearchButton, TerminalSearch } from '@/features/terminal/terminal-search'
import { TERMINAL_FONT_FAMILY, TERMINAL_THEMES } from '@/features/terminal/terminal-view'
import { useTheme } from '@/features/theme/theme-provider'
import { cn } from '@/lib/utils'

const HIDE_CURSOR = '\x1b[?25l'
const SCROLLBACK_LINES = 5000
const LOGS_UNAVAILABLE = '[logs indisponíveis]\r\n'

export function ContainerLogs({ id, name }: { id: string; name: string }) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const terminalRef = useRef<Terminal | null>(null)
  const searchRef = useRef<SearchAddon | null>(null)
  const [searching, setSearching] = useState(false)
  const { theme } = useTheme()

  useEffect(() => {
    const host = hostRef.current
    if (!host) {
      return
    }
    const terminal = new Terminal({
      convertEol: true,
      disableStdin: true,
      fontFamily: TERMINAL_FONT_FAMILY,
      fontSize: 13,
      lineHeight: 1.25,
      scrollback: SCROLLBACK_LINES,
      theme: TERMINAL_THEMES[theme],
    })
    const fit = new FitAddon()
    const search = new SearchAddon()
    terminal.loadAddon(fit)
    terminal.loadAddon(search)
    terminal.open(host)
    terminal.write(HIDE_CURSOR)
    fit.fit()
    terminalRef.current = terminal
    searchRef.current = search
    const observer = new ResizeObserver(() => fit.fit())
    observer.observe(host)

    const scheme = location.protocol === 'https:' ? 'wss' : 'ws'
    const stream = new WebSocket(`${scheme}://${location.host}/api/docker/logs?container=${id}`)
    stream.onmessage = (event) => terminal.write(event.data)
    stream.onerror = () => terminal.write(LOGS_UNAVAILABLE)

    return () => {
      stream.onmessage = null
      stream.onerror = null
      stream.close()
      observer.disconnect()
      terminalRef.current = null
      searchRef.current = null
      terminal.dispose()
    }
  }, [id])

  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.options.theme = TERMINAL_THEMES[theme]
    }
  }, [theme])

  useEffect(() => {
    const openSearch = (event: KeyboardEvent) => {
      if (event.ctrlKey && !event.shiftKey && event.code === 'KeyF') {
        event.preventDefault()
        setSearching(true)
      }
    }
    window.addEventListener('keydown', openSearch, true)
    return () => window.removeEventListener('keydown', openSearch, true)
  }, [])

  const clearLogs = () => {
    terminalRef.current?.reset()
    terminalRef.current?.write(HIDE_CURSOR)
  }

  const closeSearch = () => {
    searchRef.current?.clearDecorations()
    setSearching(false)
  }

  return (
    <div className="relative h-full w-full">
      {searching && searchRef.current && (
        <TerminalSearch addon={searchRef.current} label="Buscar nos logs" onClose={closeSearch} />
      )}
      <FloatingSearchButton className="absolute right-14 bottom-1" onClick={() => setSearching(true)} />
      <Button
        variant="outline"
        size="icon"
        aria-label="Limpar logs"
        title="Limpar logs"
        className={cn(FLOATING_BUTTON_CLASS, 'absolute right-4 bottom-1')}
        onClick={clearLogs}
      >
        <LuEraser />
      </Button>
      <div ref={hostRef} aria-label={`Logs de ${name}`} className="h-full w-full" />
    </div>
  )
}
