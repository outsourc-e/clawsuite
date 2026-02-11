import { useCallback, useState } from 'react'
import { Editor } from '@monaco-editor/react'
import { createFileRoute } from '@tanstack/react-router'
import { usePageTitle } from '@/hooks/use-page-title'
import { FileExplorerSidebar } from '@/components/file-explorer'
import { resolveTheme, useSettings } from '@/hooks/use-settings'

const INITIAL_EDITOR_VALUE = `// Files workspace
// Use the file tree on the left to browse and manage project files.
// "Insert as reference" actions appear here for quick context snippets.

function note() {
  return 'Ready to explore files.'
}
`

export const Route = createFileRoute('/files')({
  component: FilesRoute,
})

function FilesRoute() {
  usePageTitle('Files')
  const { settings } = useSettings()
  const [fileExplorerCollapsed, setFileExplorerCollapsed] = useState(false)
  const [editorValue, setEditorValue] = useState(INITIAL_EDITOR_VALUE)
  const resolvedTheme = resolveTheme(settings.theme)

  const handleInsertReference = useCallback(function handleInsertReference(
    reference: string,
  ) {
    setEditorValue((prev) => `${prev}\n${reference}\n`)
  },
  [])

  return (
    <div className="h-full bg-surface text-primary-900">
      <div className="flex h-full min-h-0">
        <FileExplorerSidebar
          collapsed={fileExplorerCollapsed}
          onToggle={function onToggleFileExplorer() {
            setFileExplorerCollapsed((prev) => !prev)
          }}
          onInsertReference={handleInsertReference}
        />
        <main className="flex min-w-0 flex-1 flex-col">
          <header className="border-b border-primary-200 px-4 py-3">
            <h1 className="text-lg font-medium text-balance">Files</h1>
            <p className="text-sm text-primary-600 text-pretty">
              Explore your workspace and draft notes in the editor.
            </p>
          </header>
          <div className="min-h-0 flex-1">
            <Editor
              height="100%"
              theme={resolvedTheme === 'dark' ? 'vs-dark' : 'vs-light'}
              language="typescript"
              value={editorValue}
              onChange={function onEditorChange(value) {
                setEditorValue(value || '')
              }}
              options={{
                minimap: { enabled: settings.editorMinimap },
                fontSize: settings.editorFontSize,
                scrollBeyondLastLine: false,
                wordWrap: settings.editorWordWrap ? 'on' : 'off',
              }}
            />
          </div>
        </main>
      </div>
    </div>
  )
}
