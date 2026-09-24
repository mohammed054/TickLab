import Editor, { loader, type OnMount } from '@monaco-editor/react'
import * as monaco from 'monaco-editor/editor/editor.api'
import 'monaco-editor/languages/definitions/python/python'
import editorWorker from 'monaco-editor/editor/editor.worker?worker'

self.MonacoEnvironment = {
  getWorker: () => new editorWorker(),
}

loader.config({ monaco })

export { Editor, monaco }
export type { OnMount }
