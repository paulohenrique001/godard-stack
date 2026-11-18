import { useEffect, useRef, useState } from 'react'
import { FitAddon } from '@xterm/addon-fit'
import { SearchAddon } from '@xterm/addon-search'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { Terminal, type ITheme } from '@xterm/xterm'
import '@xterm/xterm/css/xterm.css'
import {
  clearTerminalTranscript,
  createTerminalTicket,
  fetchTerminalTranscript,
  terminalSocketUrl,
  type RuntimeStatus,
} from '../../api'
import { TerminalSearch } from './terminal-search'
import type { CommandInsertion, TerminalMachine, TerminalStatus } from './types'

const IDLE_IGNORED_KEYS = new Set(['\x03', '\x04'])
const SCROLLBACK_LINES = 10_000
const SHELL_SETTLE_MS = 100
const OSC_CURRENT_DIRECTORY = 7
const PRINTABLE_INPUT = /^[^\x00-\x1f\x7f]+$/
const CLEAR_LINE_SEQUENCE = '\r\x1b[2K'
const LEAVE_ALTERNATE_SCREEN = '\x1b[?1049l'
const RESTORE_END_SEQUENCE = '\x1b[?2004l\x1b[?25h\x1b[0m'
const LINE_ENDS_IN_PROMPT = /[$#]$/
const SESSION_END_MARKER = '\x1b]777;session-end\x07'
const SESSION_END_LABEL = ' session end '
const NEW_SESSION_CONTROL = '\u0001new'
const ATTACHED_SESSION_CONTROL = '\u0001attached'
const PERSISTENCE_ERROR_CONTROL = '\u0001persistence-error'

const TERMINAL_THEMES: Record<'light' | 'dark', ITheme> = {
  light: {
    background: '#ffffff',
    foreground: '#23262b',
    cursor: '#9a6a00',
    cursorAccent: '#ffffff',
    selectionBackground: '#ffb40033',
    black: '#1f2328',
    red: '#cf222e',
    green: '#1a7f37',
    yellow: '#7d4e00',
    blue: '#0550ae',
    magenta: '#8250df',
    cyan: '#1b7c83',
    white: '#6e7781',
    brightBlack: '#57606a',
    brightRed: '#a40e26',
    brightGreen: '#1a7f37',
    brightYellow: '#633c01',
    brightBlue: '#0969da',
    brightMagenta: '#8250df',
    brightCyan: '#1b7c83',
    brightWhite: '#6e7781',
  },
  dark: {
    background: '#1b1e23',
    foreground: '#eceef0',
    cursor: '#ffd166',
    cursorAccent: '#1b1e23',
    selectionBackground: '#ffd16640',
    black: '#23262c',
    red: '#e8796d',
    green: '#62c79a',
    yellow: '#e5b567',
    blue: '#7fb2e5',
    magenta: '#ffd166',
    cyan: '#6fc3c9',
    white: '#c9cdd2',
    brightBlack: '#8d939b',
    brightRed: '#f09a90',
    brightGreen: '#85d9b3',
    brightYellow: '#f0cb8c',
    brightBlue: '#a2c9ef',
    brightMagenta: '#ffe39b',
    brightCyan: '#92d6da',
    brightWhite: '#eceef0',
  },
}

const writeAndWait = (terminal: Terminal, data: string) =>
  new Promise<void>((resolve) => terminal.write(data, resolve))

function sessionDivider(columns: number) {
  const side = '-'.repeat(Math.max(Math.floor((columns - SESSION_END_LABEL.length) / 2), 0))
  return `\r\n\x1b[90m${side}${SESSION_END_LABEL}${side}\x1b[0m\r\n\r\n`
}

async function settleCursor(terminal: Terminal) {
  const alternate = terminal.buffer.active.type === 'alternate'
  await writeAndWait(terminal, (alternate ? LEAVE_ALTERNATE_SCREEN : '') + RESTORE_END_SEQUENCE)
  const buffer = terminal.buffer.active
  const line = buffer.getLine(buffer.baseY + buffer.cursorY)?.translateToString(true) ?? ''
  if (LINE_ENDS_IN_PROMPT.test(line)) {
    await writeAndWait(terminal, CLEAR_LINE_SEQUENCE)
  } else if (buffer.cursorX > 0) {
    await writeAndWait(terminal, '\r\n')
  }
}

function buildPrompt(machine: TerminalMachine, directory: string | null) {
  const path = directory || '~'
  return machine.identity
    ? `\x1b[01;32m${machine.identity}\x1b[0m:\x1b[01;34m${path}\x1b[0m$ `
    : '$ '
}

type TerminalViewProps = {
  runtime: RuntimeStatus
  tabId: number
  active: boolean
  alive: boolean
  cwd: string | null
  machine: TerminalMachine
  theme: 'light' | 'dark'
  insertion: CommandInsertion | null
  clearRequest: number
  searchRequest: number
  focusRequest: number
  reconnectRequest: number
  onStatusChange: (status: TerminalStatus) => void
  onPersistenceError: (message: string) => void
}

export function TerminalView({
  runtime,
  tabId,
  active,
  alive,
  cwd,
  machine,
  theme,
  insertion,
  clearRequest,
  searchRequest,
  focusRequest,
  reconnectRequest,
  onStatusChange,
  onPersistenceError,
}: TerminalViewProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const terminalRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const searchRef = useRef<SearchAddon | null>(null)
  const clearRef = useRef<() => void>(() => undefined)
  const reconnectRef = useRef<() => void>(() => undefined)
  const activeRef = useRef(active)
  const aliveRef = useRef(alive)
  const cwdRef = useRef(cwd)
  const runtimeRef = useRef(runtime)
  const machineRef = useRef(machine)
  const [searching, setSearching] = useState(false)
  activeRef.current = active
  aliveRef.current = alive
  cwdRef.current = cwd
  runtimeRef.current = runtime
  machineRef.current = machine

  useEffect(() => {
    const host = hostRef.current
    if (!host) {
      return
    }
    const terminal = new Terminal({
      cursorBlink: false,
      fontFamily: 'ui-monospace, "Cascadia Mono", "DejaVu Sans Mono", monospace',
      fontSize: 14,
      lineHeight: 1.25,
      scrollback: SCROLLBACK_LINES,
      theme: TERMINAL_THEMES[theme],
    })
    const fit = new FitAddon()
    const search = new SearchAddon()
    terminal.loadAddon(fit)
    terminal.loadAddon(search)
    terminal.loadAddon(new WebLinksAddon())
    terminal.open(host)
    terminalRef.current = terminal
    fitRef.current = fit
    searchRef.current = search

    terminal.attachCustomKeyEventHandler((event) => {
      if (event.type !== 'keydown' || !event.ctrlKey) {
        return true
      }
      if (event.shiftKey && event.code === 'KeyC') {
        event.preventDefault()
        const selection = terminal.getSelection()
        if (selection) {
          navigator.clipboard.writeText(selection).catch(() => undefined)
        }
        return false
      }
      if (event.shiftKey && event.code === 'KeyV') {
        event.preventDefault()
        navigator.clipboard
          .readText()
          .then((text) => terminal.paste(text))
          .catch(() => undefined)
        return false
      }
      if (!event.shiftKey && event.code === 'KeyF' && terminal.buffer.active.type === 'normal') {
        event.preventDefault()
        setSearching(true)
        return false
      }
      return true
    })

    const fitIfVisible = () => {
      if (host.offsetWidth > 0) {
        fit.fit()
      }
    }
    fitIfVisible()
    if (activeRef.current) {
      terminal.focus()
    }
    const observer = new ResizeObserver(fitIfVisible)
    observer.observe(host)

    let directory = cwdRef.current
    const directoryHandler = terminal.parser.registerOscHandler(OSC_CURRENT_DIRECTORY, (data) => {
      directory = data
      return true
    })
    const writePrompt = () => terminal.write(buildPrompt(machineRef.current, directory))
    let restoring = true
    let disposed = false
    let connecting = false
    let socket: WebSocket | null = null
    let pendingInput = ''
    let bufferedOutput = ''
    let shellReady = false
    let requiresRecovery = false
    let settleTimer: ReturnType<typeof setTimeout> | undefined

    const startSession = async (attaching: boolean) => {
      if (disposed || socket || connecting) {
        return
      }
      requiresRecovery = false
      connecting = true
      onStatusChange('connecting')
      let ticket: string
      try {
        ticket = (await createTerminalTicket(runtimeRef.current, tabId)).ticket
      } catch {
        connecting = false
        requiresRecovery = true
        onStatusChange('disconnected')
        terminal.write('\r\n[não foi possível iniciar a sessão — use Reconectar]\r\n')
        return
      }
      if (disposed) {
        connecting = false
        return
      }
      let session: WebSocket
      try {
        session = new WebSocket(terminalSocketUrl(runtimeRef.current, tabId, ticket))
      } catch {
        connecting = false
        requiresRecovery = true
        onStatusChange('disconnected')
        terminal.write('\r\n[não foi possível iniciar a sessão — use Reconectar]\r\n')
        return
      }
      socket = session
      connecting = false
      let opened = false

      const revealShell = () => {
        if (socket !== session) {
          return
        }
        shellReady = true
        const divider = attaching ? sessionDivider(terminal.cols) : ''
        terminal.write(CLEAR_LINE_SEQUENCE + divider + bufferedOutput)
        bufferedOutput = ''
        if (pendingInput) {
          session.send(`i${pendingInput}`)
          pendingInput = ''
        }
      }

      session.onopen = () => {
        if (socket !== session) {
          return
        }
        opened = true
        onStatusChange('connected')
        session.send(`r${terminal.cols},${terminal.rows}`)
      }
      session.onmessage = (event) => {
        if (socket !== session || typeof event.data !== 'string') {
          return
        }
        if (event.data === NEW_SESSION_CONTROL) {
          return
        }
        if (event.data === ATTACHED_SESSION_CONTROL) {
          shellReady = true
          if (pendingInput) {
            session.send(`i${pendingInput}`)
            pendingInput = ''
          }
          return
        }
        if (event.data === PERSISTENCE_ERROR_CONTROL) {
          onPersistenceError('Não foi possível salvar o histórico deste console.')
          return
        }
        if (shellReady) {
          terminal.write(event.data)
          return
        }
        bufferedOutput += event.data
        clearTimeout(settleTimer)
        settleTimer = setTimeout(revealShell, SHELL_SETTLE_MS)
      }
      session.onclose = async () => {
        if (socket !== session) {
          return
        }
        clearTimeout(settleTimer)
        const sessionWasVisible = shellReady
        await writeAndWait(terminal, bufferedOutput)
        bufferedOutput = ''
        socket = null
        pendingInput = ''
        shellReady = false
        requiresRecovery = true
        onStatusChange('disconnected')
        if (!opened) {
          terminal.write('\r\n[não foi possível iniciar a sessão — use Reconectar]\r\n')
        } else if (sessionWasVisible) {
          await settleCursor(terminal)
          terminal.write(sessionDivider(terminal.cols))
        }
        if (opened) {
          terminal.write('\x1b[90m[conexão interrompida — use Reconectar]\x1b[0m\r\n')
        }
      }
    }

    reconnectRef.current = () => {
      if (!disposed && !restoring && !socket && !connecting) {
        void startSession(true)
      }
    }

    const restore = async () => {
      const transcript = await fetchTerminalTranscript(runtimeRef.current, tabId).catch(() => {
        onPersistenceError('Não foi possível recuperar o histórico deste console.')
        return ''
      })
      if (disposed) {
        return
      }
      const restored = transcript.replaceAll(SESSION_END_MARKER, sessionDivider(terminal.cols))
      if (transcript) {
        await writeAndWait(terminal, restored)
      }
      restoring = false
      if (aliveRef.current) {
        void startSession(true)
        return
      }
      if (transcript) {
        await settleCursor(terminal)
        if (!transcript.endsWith(SESSION_END_MARKER)) {
          await writeAndWait(terminal, sessionDivider(terminal.cols))
        }
      }
      if (!disposed) {
        writePrompt()
      }
    }
    void restore()

    clearRef.current = () => {
      clearTerminalTranscript(runtimeRef.current, tabId)
        .then(() => {
          if (disposed) {
            return
          }
          if (socket) {
            terminal.clear()
          } else {
            terminal.reset()
            writePrompt()
          }
        })
        .catch(() => onPersistenceError('Não foi possível limpar o histórico deste console.'))
    }

    const queueInput = (data: string) => {
      pendingInput += data
      if (PRINTABLE_INPUT.test(data)) {
        terminal.write(data)
      }
    }
    const input = terminal.onData((data) => {
      if (restoring) {
        return
      }
      if (socket && shellReady && socket.readyState === WebSocket.OPEN) {
        socket.send(`i${data}`)
      } else if (socket || connecting) {
        queueInput(data)
      } else if (!requiresRecovery && !IDLE_IGNORED_KEYS.has(data)) {
        queueInput(data)
        void startSession(false)
      }
    })
    const resize = terminal.onResize(() => {
      if (socket?.readyState === WebSocket.OPEN) {
        socket.send(`r${terminal.cols},${terminal.rows}`)
      }
    })
    return () => {
      disposed = true
      observer.disconnect()
      input.dispose()
      resize.dispose()
      directoryHandler.dispose()
      clearTimeout(settleTimer)
      if (socket) {
        socket.onclose = null
        socket.close()
      }
      terminal.dispose()
      terminalRef.current = null
      fitRef.current = null
      searchRef.current = null
    }
  }, [tabId])

  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.options.theme = TERMINAL_THEMES[theme]
    }
  }, [theme])

  useEffect(() => {
    if (active) {
      fitRef.current?.fit()
      terminalRef.current?.focus()
    }
  }, [active, focusRequest])

  useEffect(() => {
    if (active && reconnectRequest > 0) {
      reconnectRef.current()
    }
  }, [active, reconnectRequest])

  useEffect(() => {
    if (active && insertion) {
      terminalRef.current?.paste(insertion.command)
      terminalRef.current?.focus()
    }
  }, [active, insertion])

  useEffect(() => {
    if (active && clearRequest > 0) {
      clearRef.current()
      terminalRef.current?.focus()
    }
  }, [active, clearRequest])

  useEffect(() => {
    if (active && searchRequest > 0 && terminalRef.current?.buffer.active.type === 'normal') {
      setSearching(true)
    }
  }, [active, searchRequest])

  const closeSearch = () => {
    searchRef.current?.clearDecorations()
    setSearching(false)
    terminalRef.current?.focus()
  }

  return (
    <div className="relative h-full rounded-xl border bg-card p-3 shadow-sm">
      {searching && searchRef.current && (
        <TerminalSearch addon={searchRef.current} onClose={closeSearch} />
      )}
      <div className="h-full w-full" ref={hostRef} />
    </div>
  )
}
