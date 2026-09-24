export type MonitorShell = 'main' | 'secondary'
export type SaveTextFileResult = 'saved' | 'cancelled' | 'fallback'

type TauriWindowOptions = {
  url: string
  width: number
  height: number
  minWidth: number
  minHeight: number
  resizable: boolean
}

export function isTauriRuntime(): boolean {
  return '__TAURI_INTERNALS__' in globalThis
}

export function getBrowserShell(): MonitorShell | null {
  const value = new URLSearchParams(globalThis.location?.search ?? '').get('shell')
  return value === 'main' || value === 'secondary' ? value : null
}

export async function saveTextFile(contents: string, suggestedName: string, extension: string): Promise<SaveTextFileResult> {
  if (!isTauriRuntime()) return 'fallback'
  try {
    const { save } = await import('@tauri-apps/plugin-dialog')
    const path = await save({ defaultPath: suggestedName, filters: [{ name: extension.toUpperCase(), extensions: [extension] }] })
    if (!path) return 'cancelled'
    const { writeTextFile } = await import('@tauri-apps/plugin-fs')
    await writeTextFile(path, contents)
    return 'saved'
  } catch {
    return 'fallback'
  }
}

export async function openMonitorWindow(shell: MonitorShell): Promise<void> {
  if (isTauriRuntime()) {
    const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow')
    const label = shell
    const existing = await WebviewWindow.getByLabel(label)
    if (existing) {
      await existing.setFocus()
      return
    }
    const options: TauriWindowOptions = {
      url: `index.html?shell=${shell}`,
      width: shell === 'main' ? 2560 : 1920,
      height: shell === 'main' ? 1440 : 1200,
      minWidth: shell === 'main' ? 1280 : 1024,
      minHeight: 720,
      resizable: true,
    }
    new WebviewWindow(label, options)
    return
  }
  const url = `${globalThis.location.origin}${globalThis.location.pathname}?shell=${shell}`
  globalThis.open(url, `btc-workstation-${shell}`, 'width=1400,height=900')
}
