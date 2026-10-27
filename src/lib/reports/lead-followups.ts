/**
 * Builder murni antrean follow-up lead terjadwal (F-2026-10-21-037;
 * F-2026-10-25-047-S Q-LFU-1 terputus Lead 2026-10-26 00:40 WIB).
 *
 * LeadActivity.scheduledAt tersimpan (crm.actions.ts) tapi tidak ada antrean
 * jatuh-tempo: stale-leads.ts hanya mengukur aktivitas terakhir. Builder ini
 * hanya membaca kolom existing Lead + LeadActivity — tanpa migrasi, tanpa
 * mutasi. Q-LFU-1: lead berstatus persis `lost` TIDAK masuk antrean; lead
 * `won` dan lead ber-`convertedAt` berstatus bukan `lost` TETAP tampil;
 * `convertedAt` sendiri tidak jadi penyaring (lihat LeadFollowupInput).
 * Q-LFU-2 ditunda: tanpa filter `assignedTo` — antrean global `view_leads`.
 *
 * Per lead dipilih jadwal terawal yang sudah jatuh tempo: scheduledAt tidak
 * kosong, completedAt kosong, dan hari kalender WIB scheduledAt <= hari ini.
 * Jadwal besok belum tampil; jadwal hari ini tampil dengan overdueDays 0.
 * Urut: overdue terbesar dulu, seri diputus leadNumber lalu leadId.
 */

export interface LeadFollowupActivityInput {
  scheduledAt: Date | null
  completedAt: Date | null
  createdAt: Date
}

export interface LeadFollowupInput {
  id: number
  slug: string | null
  leadNumber: string | null
  name: string
  status: string
  // Opsional: putusan Q-LFU-1 menegaskan convertedAt TIDAK jadi penyaring
  // sendiri — hanya dibaca loader untuk tes/jejak kontrak; builder sengaja
  // mengabaikannya.
  convertedAt?: Date | null
  activities: readonly LeadFollowupActivityInput[]
}

export interface LeadFollowupRow {
  leadId: number
  slug: string | null
  leadNumber: string | null
  name: string
  status: string
  /** Jadwal follow-up terawal yang sudah jatuh tempo dan belum selesai. */
  scheduledAt: Date
  /** Hari kalender sejak scheduledAt, >= 0. */
  overdueDays: number
}

export interface LeadFollowups {
  rows: LeadFollowupRow[]
  total: number
}

const MS_PER_DAY = 86_400_000

/** Awal hari kalender lokal (app TZ=Asia/Jakarta) sebagai angka hari. */
function calendarDay(date: Date): number {
  return Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / MS_PER_DAY)
}

function earliestDueActivity(
  lead: LeadFollowupInput,
  today: number,
): LeadFollowupActivityInput | null {
  let earliest: LeadFollowupActivityInput | null = null
  for (const activity of lead.activities) {
    if (!activity.scheduledAt || activity.completedAt) continue
    if (calendarDay(activity.scheduledAt) > today) continue
    if (
      !earliest ||
      activity.scheduledAt.getTime() < earliest.scheduledAt!.getTime() ||
      (activity.scheduledAt.getTime() === earliest.scheduledAt!.getTime() &&
        activity.createdAt.getTime() < earliest.createdAt.getTime())
    ) {
      earliest = activity
    }
  }
  return earliest
}

export function buildLeadFollowups(
  inputs: readonly LeadFollowupInput[],
  now: Date = new Date(),
): LeadFollowups {
  const today = calendarDay(now)
  const rows: LeadFollowupRow[] = []
  for (const input of inputs) {
    // Q-LFU-1: `lost` terputus dari antrean; status lain (termasuk `won`) tetap.
    if (input.status === "lost") continue
    const due = earliestDueActivity(input, today)
    if (!due?.scheduledAt) continue
    rows.push({
      leadId: input.id,
      slug: input.slug,
      leadNumber: input.leadNumber,
      name: input.name,
      status: input.status,
      scheduledAt: due.scheduledAt,
      overdueDays: Math.max(0, today - calendarDay(due.scheduledAt)),
    })
  }
  rows.sort((a, b) => {
    if (a.overdueDays !== b.overdueDays) return b.overdueDays - a.overdueDays
    const aNo = a.leadNumber ?? ""
    const bNo = b.leadNumber ?? ""
    if (aNo !== bNo) return aNo < bNo ? -1 : 1
    return a.leadId - b.leadId
  })
  return { rows, total: rows.length }
}
