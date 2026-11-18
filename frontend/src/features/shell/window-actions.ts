import { getCurrentWindow } from '@tauri-apps/api/window'

export function runDesktopWindowAction(
  action: (appWindow: ReturnType<typeof getCurrentWindow>) => Promise<void>,
) {
  if (!('__TAURI_INTERNALS__' in window)) {
    return
  }

  void action(getCurrentWindow()).catch(() => undefined)
}
