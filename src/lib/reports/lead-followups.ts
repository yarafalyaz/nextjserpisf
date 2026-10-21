/**
 * Builder murni antrean follow-up lead terjadwal (F-2026-10-21-037).
 *
 * LeadActivity.scheduledAt bisa disimpan, tapi tidak ada daftar "follow-up
 * jatuh tempo hari ini / sudah lewat" — stale-leads (F-2026-10-20-29(a))
 * mengukur aktivitas terakhir, bukan jadwal berikutnya, dan jadwal masa
 * depan justru membuat lead terlihat segar di sana. Builder ini melengkapinya
 * tanpa migrasi, tanpa mutasi: hanya kolom existing Lead + LeadActivity.
 *
 * Aturan per lead aktif (deletedAt kosong disaring loader):
 * - hanya aktivitas dengan scheduledAt terisi dan completedAt kosong yang
 *   dianggap follow-up terbuka;
 * - per lead diambil jadwal terawal yang belum selesai (nextFollowUpAt),
 *   seri diputus id aktivitas terkecil agar stabil;
 * - follow-up terbuka masuk antrean bila hari kalender scheduledAt <= hari
 *   ini (WIB, TZ app) — termasuk yang jatuh tempo hari ini (overdueDays 0);
 * - jadwal masa depan belum masuk antrean.
 *
 * Urut: paling terlambat dulu (overdueDays terbesar), seri diputus
 * leadNumber lalu id lead. Label terpisah dari stale-leads: "jadwal
 * follow-up lewat" di sini vs "lead diam" di stale-leads — jangan digabung.
 */

export interface LeadFollowUpActivityInput {
  id: number
  type: string
  subject: string | null
  scheduledAt: Date | null
  completedAt: Date | null
}

export interface LeadFollowUpInput {
  id: number
  slug: string | null
  leadNumber: string | null
  name: string
  company: string | null
  status: string
  activities: readonly LeadFollowUpActivityInput[]
}

export interface LeadFollowUpRow {
  leadId: number
  slug: string | null
  leadNumber: string | null
  name: string
  company: string | null
  status: string
  /** Aktivitas follow-up terbuka terawal per lead. */
  activityId: number
  activityType: string
  subject: string | null
  /** Jadwal follow-up terawal yang belum selesai. */
  nextFollowUpAt: Date
  /** Hari kalender sejak nextFollowUpAt; 0 = jatuh tempo hari ini. */
  overdueDays: number
  /** Jumlah follow-up terbuka (terjadwal, belum selesai) lead ini. */
  openFollowUpCount: number
}

export interface LeadFollowUps {
  rows: LeadFollowUpRow[]
  total: number
  notice: string | null
}

const MS_PER_DAY = 86_400_000

/** Awal hari kalender lokal (app TZ=Asia/Jakarta) sebagai angka hari. */
function calendarDay(date: Date): number {
  return Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / MS_PER_DAY)
}

export function buildLeadFollowUps(
  inputs: readonly LeadFollowUpInput[],
  now: Date = new Date(),
): LeadFollowUps {
  const today = calendarDay(now)
  const rows: LeadFollowUpRow[] = []
  for (const input of inputs) {
    const open = input.activities
      .filter((a) => a.scheduledAt !== null && a.completedAt === null)
      .sort((a, b) => {
        const at = (a.scheduledAt as Date).getTime()
        const bt = (b.scheduledAt as Date).getTime()
        if (at !== bt) return at - bt
        return a.id - b.id
      })
    if (open.length === 0) continue
    const earliest = open[0]
    const scheduledAt = earliest.scheduledAt as Date
    const overdueDays = today - calendarDay(scheduledAt)
    if (overdueDays < 0) continue
    rows.push({
      leadId: input.id,
      slug: input.slug,
      leadNumber: input.leadNumber,
      name: input.name,
      company: input.company,
      status: input.status,
      activityId: earliest.id,
      activityType: earliest.type,
      subject: earliest.subject,
      nextFollowUpAt: scheduledAt,
      overdueDays,
      openFollowUpCount: open.length,
    })
  }
  rows.sort((a, b) => {
    if (a.overdueDays !== b.overdueDays) return b.overdueDays - a.overdueDays
    const aNo = a.leadNumber ?? ""
    const bNo = b.leadNumber ?? ""
    if (aNo !== bNo) return aNo < bNo ? -1 : 1
    return a.leadId - b.leadId
  })
  return {
    rows,
    total: rows.length,
    notice:
      rows.length === 0
        ? "Tidak ada jadwal follow-up lead yang jatuh tempo atau lewat hari ini."
        : null,
  }
}
