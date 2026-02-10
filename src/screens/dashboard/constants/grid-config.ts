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
  | 'usage-meter'
  | 'tasks'
  | 'agent-status'
  | 'cost-tracker'
  | 'recent-sessions'
  | 'notifications'
  | 'activity-log'

type WidgetRegistryEntry = {
  id: WidgetId
  defaultTier: WidgetSizeTier
  /** Tiers this widget is allowed to use */
  allowedTiers: WidgetSizeTier[]
}

export const WIDGET_REGISTRY: WidgetRegistryEntry[] = [
  // ── Above fold: Operational truth ──
  { id: 'agent-status', defaultTier: 'M', allowedTiers: ['M', 'L'] },
  { id: 'cost-tracker', defaultTier: 'M', allowedTiers: ['M', 'L'] },
  { id: 'usage-meter', defaultTier: 'M', allowedTiers: ['M', 'L'] },
  // ── Mid: Context ──
  { id: 'recent-sessions', defaultTier: 'M', allowedTiers: ['M', 'L'] },
  { id: 'activity-log', defaultTier: 'M', allowedTiers: ['S', 'M'] },
  // ── Below fold: Secondary ──
  { id: 'notifications', defaultTier: 'M', allowedTiers: ['M', 'L'] },
  { id: 'tasks', defaultTier: 'M', allowedTiers: ['M', 'L'] },
  // Time + Weather moved to header ambient status (no longer grid widgets)
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

/**
 * Auto-generate a layout by flowing widgets left-to-right, wrapping rows.
 * Used for md/sm/xs where manual positioning isn't critical.
 */
function buildFlowLayout(breakpoint: keyof typeof GRID_COLS): Layout {
  const cols = GRID_COLS[breakpoint]
  const layouts: LayoutItem[] = []
  let x = 0
  let y = 0
  let rowMaxH = 0

  for (const entry of WIDGET_REGISTRY) {
    const dims = tierConstraints(entry.defaultTier, breakpoint)

    if (x + dims.w > cols) {
      x = 0
      y += rowMaxH
      rowMaxH = 0
    }

    layouts.push({ i: entry.id, x, y, ...dims })

    rowMaxH = Math.max(rowMaxH, dims.h)
    x += dims.w

    if (x >= cols) {
      x = 0
      y += rowMaxH
      rowMaxH = 0
    }
  }

  return layouts
}

/**
 * Hand-crafted lg (12-col) layout for an intentional default dashboard.
 * Widgets are placed in a deliberate priority order.
 */
function buildLgLayout(): Layout {
  const c = (_id: WidgetId, tier: WidgetSizeTier) => tierConstraints(tier, 'lg')
  return [
    // ── Above fold: Operational truth ──
    // Row 0: Active Agents (6) + Cost Tracker (6)
    { i: 'agent-status', x: 0, y: 0, ...c('agent-status', 'M') },
    { i: 'cost-tracker', x: 6, y: 0, ...c('cost-tracker', 'M') },
    // Row 1: Usage Meter (6) + Recent Sessions (6)
    { i: 'usage-meter', x: 0, y: 5, ...c('usage-meter', 'M') },
    { i: 'recent-sessions', x: 6, y: 5, ...c('recent-sessions', 'M') },
    // ── Mid: Streams ──
    // Row 2: Activity Log (6) + Notifications (6)
    { i: 'activity-log', x: 0, y: 10, ...c('activity-log', 'M') },
    { i: 'notifications', x: 6, y: 10, ...c('notifications', 'M') },
    // ── Below fold ──
    // Row 3: Tasks Demo (6)
    { i: 'tasks', x: 0, y: 15, ...c('tasks', 'M') },
  ] as Layout
}

export const DEFAULT_LAYOUTS: ResponsiveLayouts = {
  lg: buildLgLayout(),
  md: buildFlowLayout('md'),
  sm: buildFlowLayout('sm'),
  xs: buildFlowLayout('xs'),
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
