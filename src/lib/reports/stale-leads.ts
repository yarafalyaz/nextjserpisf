/**
 * Builder murni daftar lead basi (F-2026-10-20-29(a)).
 *
 * Lead status new/contacted tenggelam tanpa pengingat follow-up. Builder ini
 * hanya membaca kolom existing Lead + LeadActivity — tanpa konteks kendaraan
 * (inti F-29(b) Lead.customerVehicleId ditunda-teknis; default lead generik
 * aktif), tanpa migrasi, tanpa mutasi.
 *
 * "Aktivitas terakhir" per lead = tanggal terbaru dari seluruh kegiatannya:
 * completedAt bila sudah selesai, scheduledAt bila terjadwal, jatuh ke
 * createdAt aktivitas. Lead tanpa aktivitas sama sekali memakai Lead.createdAt.
 * Basi = umur aktivitas terakhir (hari kalender WIB, TZ app) MELEBIHI ambang
 * (default 7 hari). Aktivitas di masa depan (jadwal belum jatuh tempo) tidak
 * pernah basi. Urut: basi terlama dulu, seri diputus documentNo lalu id.
 */

export const STALE_LEAD_STATUSES = ["new", "contacted"] as const
export const STALE_LEAD_THRESHOLD_DAYS = 7

export interface StaleLeadActivityInput {
  completedAt: Date | null
  scheduledAt: Date | null
  createdAt: Date
}

export interface StaleLeadInput {
  id: number
  slug: string | null
  leadNumber: string | null
  name: string
  company: string | null
  status: string
  createdAt: Date
  activities: readonly StaleLeadActivityInput[]
}

export interface StaleLeadRow {
  id: number
  slug: string | null
  leadNumber: string | null
  name: string
  company: string | null
  status: string
  /** Tanggal aktivitas terakhir; Lead.createdAt bila tanpa aktivitas. */
  lastActivityAt: Date
  /** Hari kalender sejak aktivitas terakhir, >= 0. */
  idleDays: number
}

export interface StaleLeads {
  rows: StaleLeadRow[]
  total: number
  thresholdDays: number
}

const MS_PER_DAY = 86_400_000

/** Awal hari kalender lokal (app TZ=Asia/Jakarta) sebagai angka hari. */
function calendarDay(date: Date): number {
  return Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / MS_PER_DAY)
}

function lastActivityAt(lead: StaleLeadInput): Date {
  let latest = lead.createdAt.getTime()
  for (const activity of lead.activities) {
    const at = (activity.completedAt ?? activity.scheduledAt ?? activity.createdAt).getTime()
    if (at > latest) latest = at
  }
  return new Date(latest)
}

export function buildStaleLeads(
  inputs: readonly StaleLeadInput[],
  now: Date = new Date(),
  thresholdDays: number = STALE_LEAD_THRESHOLD_DAYS,
): StaleLeads {
  const today = calendarDay(now)
  const rows: StaleLeadRow[] = []
  for (const input of inputs) {
    if (!(STALE_LEAD_STATUSES as readonly string[]).includes(input.status)) continue
    const last = lastActivityAt(input)
    const idleDays = Math.max(0, today - calendarDay(last))
    if (idleDays <= thresholdDays) continue
    rows.push({
      id: input.id,
      slug: input.slug,
      leadNumber: input.leadNumber,
      name: input.name,
      company: input.company,
      status: input.status,
      lastActivityAt: last,
      idleDays,
    })
  }
  rows.sort((a, b) => {
    if (a.idleDays !== b.idleDays) return b.idleDays - a.idleDays
    const aNo = a.leadNumber ?? ""
    const bNo = b.leadNumber ?? ""
    if (aNo !== bNo) return aNo < bNo ? -1 : 1
    return a.id - b.id
  })
  return { rows, total: rows.length, thresholdDays }
}
