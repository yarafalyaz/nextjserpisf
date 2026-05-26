'use client'

import { Chip } from '@heroui/react'

const statusColors: Record<string, 'success' | 'warning' | 'danger' | 'default' | 'accent'> = {
  active: 'success',
  draft: 'default',
  posted: 'success',
  cancelled: 'danger',
  pending: 'warning',
  approved: 'success',
  completed: 'success',
  partial: 'warning',
  paid: 'success',
  new: 'accent',
  contacted: 'warning',
  qualified: 'success',
  won: 'success',
  lost: 'danger',
  confirmed: 'success',
  sent: 'warning',
  accepted: 'success',
  converted: 'success',
  ordered: 'warning',
  received: 'success',
  returned: 'danger',
  in_progress: 'accent',
  on_hold: 'warning',
  rejected: 'danger',
  closed: 'default',
  overdue: 'danger',
  present: 'success',
  absent: 'danger',
  late: 'warning',
  running: 'accent',
  done: 'success',
  planned: 'default',
}

export function StatusChip({ status }: { status: string }) {
  const color = statusColors[status.toLowerCase().replace(/\s+/g, '_')] || 'default'
  return (
    <Chip color={color} size="sm" variant="soft">
      {status}
    </Chip>
  )
}
