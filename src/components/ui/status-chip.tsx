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
  paid_off: 'success',
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
  partially_received: 'warning',
  returned: 'danger',
  written_off: 'default',
  in_progress: 'accent',
  on_hold: 'warning',
  rejected: 'danger',
  closed: 'default',
  overdue: 'danger',
  present: 'success',
  absent: 'danger',
  late: 'warning',
  running: 'accent',
  pending_approval: 'warning',
  released: 'success',
  superseded: 'default',
  done: 'success',
  planned: 'default',
  scheduled: 'accent',
  applied: 'success',
  in: 'success',
  out: 'warning',
}

const toneClasses: Record<Tone, string> = {
  success: 'border-transparent bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400',
  // amber-800 di amber-100: kontras 6.37 (amber-700 hanya 4.51, mepet AA di teks kecil).
  warning: 'border-transparent bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-400',
  danger: 'border-transparent bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400',
  accent: 'border-transparent bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400',
  default: 'border-transparent bg-muted text-muted-foreground',
}

export function StatusChip({
  status,
  customLabel,
  customTone,
}: {
  status: string
  customLabel?: string
  customTone?: Tone
}) {
  const tone = customTone || statusColors[status.toLowerCase().replace(/\s+/g, '_')] || 'default'
  return (
    <Badge variant="outline" className={cn('font-medium', toneClasses[tone])}>
      {customLabel || statusLabel(status)}
    </Badge>
  )
}
