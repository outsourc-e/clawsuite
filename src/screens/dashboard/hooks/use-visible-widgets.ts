/**
 * Tracks which widgets are currently visible on the dashboard.
 * Persisted to localStorage, reversible via Reset Layout.
 */
import { useCallback, useState } from 'react'
import type { WidgetId } from '../constants/grid-config'
import { WIDGET_REGISTRY } from '../constants/grid-config'

const STORAGE_KEY = 'openclaw-dashboard-visible-widgets-v1'

function getDefaultVisibleIds(): WidgetId[] {
  return WIDGET_REGISTRY.map((w) => w.id)
}

function loadVisible(): WidgetId[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as WidgetId[]
      if (Array.isArray(parsed) && parsed.length > 0) return parsed
    }
  } catch { /* ignore */ }
  return getDefaultVisibleIds()
}

function saveVisible(ids: WidgetId[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(ids))
}

export function useVisibleWidgets() {
  const [visibleIds, setVisibleIds] = useState<WidgetId[]>(loadVisible)

  const addWidget = useCallback((id: WidgetId) => {
    setVisibleIds((prev) => {
      if (prev.includes(id)) return prev
      const next = [...prev, id]
      saveVisible(next)
      return next
    })
  }, [])

  const removeWidget = useCallback((id: WidgetId) => {
    setVisibleIds((prev) => {
      const next = prev.filter((w) => w !== id)
      saveVisible(next)
      return next
    })
  }, [])

  const resetVisible = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY)
    const defaults = getDefaultVisibleIds()
    setVisibleIds(defaults)
  }, [])

  return { visibleIds, addWidget, removeWidget, resetVisible }
}
