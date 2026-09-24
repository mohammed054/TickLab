import { useEffect } from 'react'
import { isTauriRuntime } from './nativeBridge'

interface PersistedWindowState {
  x: number
  y: number
  width: number
  height: number
}

function readState(key: string): PersistedWindowState | null {
  if (typeof localStorage === 'undefined') return null
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(key) ?? 'null')
    if (!parsed || typeof parsed !== 'object') return null
    const candidate = parsed as Partial<PersistedWindowState>
    if (![candidate.x, candidate.y, candidate.width, candidate.height].every((value) => typeof value === 'number' && Number.isFinite(value))) return null
    if (candidate.width! < 640 || candidate.height! < 480) return null
    return candidate as PersistedWindowState
  } catch {
    return null
  }
}

export function useNativeWindowState(): void {
  useEffect(() => {
    if (!isTauriRuntime()) return
    let disposed = false
    let unlistenMoved: (() => void) | undefined
    let unlistenResized: (() => void) | undefined
    void (async () => {
      const { getCurrentWindow } = await import('@tauri-apps/api/window')
      const { LogicalPosition, LogicalSize } = await import('@tauri-apps/api/dpi')
      if (disposed) return
      const currentWindow = getCurrentWindow()
      const storageKey = `ticklab.window-state.${currentWindow.label}`
      const saved = readState(storageKey)
      if (saved) {
        await currentWindow.setPosition(new LogicalPosition(saved.x, saved.y))
        await currentWindow.setSize(new LogicalSize(saved.width, saved.height))
      }
      const persist = async () => {
        const [position, size] = await Promise.all([currentWindow.outerPosition(), currentWindow.outerSize()])
        if (disposed || typeof localStorage === 'undefined') return
        localStorage.setItem(storageKey, JSON.stringify({ x: position.x, y: position.y, width: size.width, height: size.height }))
      }
      unlistenMoved = await currentWindow.onMoved(() => { void persist() })
      unlistenResized = await currentWindow.onResized(() => { void persist() })
      await persist()
    })().catch(() => undefined)
    return () => {
      disposed = true
      unlistenMoved?.()
      unlistenResized?.()
    }
  }, [])
}
