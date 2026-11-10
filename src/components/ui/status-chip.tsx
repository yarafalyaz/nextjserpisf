import { Badge } from '@/components/ui/shadcn/badge'
import { statusLabel } from '@/lib/utils/status-labels'
import { cn } from '@/lib/utils'

type Tone = 'success' | 'warning' | 'danger' | 'default' | 'accent'

const statusColors: Record<string, Tone> = {
  active: 'success',
  draft: 'default',
  posted: 'accent',
  cancelled: 'danger',
  pending: 'warning',
  approved: 'success',
  completed: 'success',
  partial: 'warning',
  paid: 'success',
  paid_off: 'success',
  unpaid: 'danger',
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
  partial_received: 'warning',
  partial_ordered: 'warning',
  delivered: 'success',
  returned: 'danger',
  reversed: 'danger',
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
  low: 'default',
  medium: 'warning',
  high: 'danger',
  urgent: 'danger',
}

const toneClasses: Record<Tone, string> = {
  success: 'border-emerald-200/80 bg-emerald-100 text-emerald-700 dark:border-emerald-500/25 dark:bg-emerald-500/10 dark:text-emerald-300',
  // amber-800 di amber-100: kontras 6.37 (amber-700 hanya 4.51, mepet AA di teks kecil).
  warning: 'border-amber-200/80 bg-amber-100 text-amber-800 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-300',
  danger: 'border-red-200/80 bg-red-100 text-red-700 dark:border-red-500/25 dark:bg-red-500/10 dark:text-red-300',
  accent: 'border-blue-200/80 bg-blue-100 text-blue-700 dark:border-blue-500/25 dark:bg-blue-500/10 dark:text-blue-300',
  default: 'border-border bg-muted/60 text-muted-foreground dark:bg-muted/40',
}

const dotClasses: Record<Tone, string> = {
  success: 'bg-emerald-600 dark:bg-emerald-400',
  warning: 'bg-amber-600 dark:bg-amber-400',
  danger: 'bg-red-600 dark:bg-red-400',
  accent: 'bg-blue-600 dark:bg-blue-400',
  default: 'bg-zinc-400 dark:bg-zinc-500',
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
      <span className={cn('size-1.5 shrink-0 rounded-full', dotClasses[tone])} aria-hidden="true" />
      {customLabel || statusLabel(status)}
    </Badge>
  )
}
