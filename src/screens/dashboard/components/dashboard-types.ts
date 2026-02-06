import type { ComponentProps } from 'react'
import type { HugeiconsIcon } from '@hugeicons/react'

export type DashboardIcon = ComponentProps<typeof HugeiconsIcon>['icon']

export type QuickAction = {
  id: string
  label: string
  description: string
  to: '/new' | '/terminal' | '/skills' | '/files'
  icon: DashboardIcon
}

export type SystemStatus = {
  gateway: {
    connected: boolean
    checkedAtIso: string
  }
  uptimeSeconds: number
  currentModel: string
  sessionCount: number
}

export type CostDay = {
  dateIso: string
  amountUsd: number
}

export type RecentSession = {
  friendlyId: string
  title: string
  preview: string
  updatedAt: number
}
