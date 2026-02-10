/**
 * Dashboard Grid Configuration
 *
 * Defines widget size tiers, per-breakpoint layouts, and widget registry.
 * All widgets snap to predefined size tiers — no free-form sizing.
 */
import type { Layout, LayoutItem, ResponsiveLayouts } from 'react-grid-layout'

/* ── Breakpoints ── */
export const GRID_BREAKPOINTS = { lg: 1080, md: 768, sm: 480, xs: 0 } as const
export const GRID_COLS = { lg: 12, md: 8, sm: 4, xs: 1 } as const
export const GRID_ROW_HEIGHT = 70
export const GRID_MARGIN: [number, number] = [10, 10]

/* ── Size Tiers ── */
export type WidgetSizeTier = 'S' | 'M' | 'L' | 'XL'

type TierDimensions = {
  /** Dimensions per breakpoint: [w, h] */
  lg: [number, number]
  md: [number, number]
  sm: [number, number]
  xs: [number, number]
}

export const SIZE_TIERS: Record<WidgetSizeTier, TierDimensions> = {
  S: {
    lg: [3, 3],
    md: [4, 3],
    sm: [4, 3],
    xs: [1, 3],
  },
  M: {
    lg: [6, 5],
    md: [8, 5],
    sm: [4, 5],
    xs: [1, 5],
  },
  L: {
    lg: [8, 5],
    md: [8, 5],
    sm: [4, 5],
    xs: [1, 5],
  },
  XL: {
    lg: [12, 3],
    md: [8, 3],
    sm: [4, 3],
    xs: [1, 3],
  },
}

/* ── Widget Registry ── */
export type WidgetId =
  | 'time-date'
  | 'usage-meter'
  | 'tasks'
  | 'agent-status'
  | 'cost-tracker'
  | 'recent-sessions'
  | 'system-status'
  | 'notifications'
  | 'activity-log'
  | 'weather'

type WidgetRegistryEntry = {
  id: WidgetId
  defaultTier: WidgetSizeTier
  /** Tiers this widget is allowed to use */
  allowedTiers: WidgetSizeTier[]
}

export const WIDGET_REGISTRY: WidgetRegistryEntry[] = [
  // Row 1: Time + System Status + Activity Log (3 small)
  { id: 'time-date', defaultTier: 'S', allowedTiers: ['S'] },
  { id: 'system-status', defaultTier: 'S', allowedTiers: ['S', 'M'] },
  { id: 'activity-log', defaultTier: 'S', allowedTiers: ['S', 'M'] },
  // Row 2-3: Main data widgets (medium)
  { id: 'usage-meter', defaultTier: 'M', allowedTiers: ['M', 'L'] },
  { id: 'cost-tracker', defaultTier: 'M', allowedTiers: ['M', 'L'] },
  { id: 'agent-status', defaultTier: 'M', allowedTiers: ['M', 'L'] },
  { id: 'tasks', defaultTier: 'M', allowedTiers: ['M', 'L'] },
  // Row 4: Sessions + Notifications (large)
  { id: 'recent-sessions', defaultTier: 'L', allowedTiers: ['L', 'M'] },
  { id: 'notifications', defaultTier: 'L', allowedTiers: ['L', 'M'] },
  // Bottom: Weather (nice-to-have)
  { id: 'weather', defaultTier: 'S', allowedTiers: ['S'] },
]

/* ── Layout Constraints ── */
function tierConstraints(tier: WidgetSizeTier, breakpoint: keyof typeof GRID_COLS) {
  const [w, h] = SIZE_TIERS[tier][breakpoint]
  const maxCols = GRID_COLS[breakpoint]
  return {
    w: Math.min(w, maxCols),
    h,
    minW: Math.min(w, maxCols),
    maxW: Math.min(w, maxCols),
    minH: h,
    maxH: h,
  }
}

/* ── Per-Breakpoint Default Layouts ── */
function buildLayout(breakpoint: keyof typeof GRID_COLS): Layout {
  const cols = GRID_COLS[breakpoint]
  const layouts: LayoutItem[] = []
  let x = 0
  let y = 0
  let rowMaxH = 0

  for (const entry of WIDGET_REGISTRY) {
    const dims = tierConstraints(entry.defaultTier, breakpoint)

    // Wrap to next row if widget doesn't fit
    if (x + dims.w > cols) {
      x = 0
      y += rowMaxH
      rowMaxH = 0
    }

    layouts.push({
      i: entry.id,
      x,
      y,
      ...dims,
    })

    rowMaxH = Math.max(rowMaxH, dims.h)
    x += dims.w

    // If we filled the row exactly, advance
    if (x >= cols) {
      x = 0
      y += rowMaxH
      rowMaxH = 0
    }
  }

  return layouts
}

export const DEFAULT_LAYOUTS: ResponsiveLayouts = {
  lg: buildLayout('lg'),
  md: buildLayout('md'),
  sm: buildLayout('sm'),
  xs: buildLayout('xs'),
}

/* ── Layout Persistence ── */
const LAYOUT_STORAGE_KEY = 'openclaw-dashboard-layouts-v2'

export function loadLayouts(): ResponsiveLayouts {
  try {
    const raw = localStorage.getItem(LAYOUT_STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as ResponsiveLayouts
      if (parsed && typeof parsed === 'object' && parsed.lg) {
        return parsed
      }
    }
  } catch { /* ignore */ }
  return DEFAULT_LAYOUTS
}

export function saveLayouts(allLayouts: ResponsiveLayouts) {
  localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(allLayouts))
}

export function resetLayouts(): ResponsiveLayouts {
  localStorage.removeItem(LAYOUT_STORAGE_KEY)
  // Also clear legacy v1 key
  localStorage.removeItem('openclaw-dashboard-layout')
  return DEFAULT_LAYOUTS
}
