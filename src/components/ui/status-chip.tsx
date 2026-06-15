import { Badge } from '@/components/ui/shadcn/badge'
import { statusLabel } from '@/lib/utils/status-labels'
import { cn } from '@/lib/utils'

type Tone = 'success' | 'warning' | 'danger' | 'default' | 'accent'

const statusColors: Record<string, Tone> = {
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
  in: 'success',
  out: 'warning',
}

const toneClasses: Record<Tone, string> = {
  success: 'border-transparent bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400',
  warning: 'border-transparent bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400',
  danger: 'border-transparent bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400',
  accent: 'border-transparent bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400',
  default: 'border-transparent bg-muted text-muted-foreground',
}

export function StatusChip({ status }: { status: string }) {
  const tone = statusColors[status.toLowerCase().replace(/\s+/g, '_')] || 'default'
  return (
    <Badge variant="outline" className={cn('font-medium', toneClasses[tone])}>
      {statusLabel(status)}
    </Badge>
  )
}
