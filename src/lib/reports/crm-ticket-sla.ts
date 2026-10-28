/**
 * F-2026-10-24-135-S — SLA tiket CRM (lapis aman: builder murni +
 * loader massal baca-saja, tanpa migrasi/kolom/status/izin baru).
 *
 * Angka + jam kerja = PUTUSAN Lead komentar PR #901 6399514412
 * (Q-SLA135-1/2 DISAHKAN): konstanta builder, BUKAN konfigurasi per
 * tiket, BUKAN WorkSchedule per departemen tahap 1.
 * - BR-CRM-01: high respons 2 jam kerja / resolusi 9 jam kerja
 *   (1 hari kerja); medium 4 / 27 (3 hari kerja); low 8 (1 hari
 *   kerja) / 45 (5 hari kerja). Mendekati = sisa <= 25% target.
 * - Jam kerja: Senin–Jumat 08:00–17:00 WIB (9 jam/hari), dipotong
 *   tanggal model `Holiday`. Sabtu/Minggu BUKAN hari kerja tahap 1.
 * - BR-CRM-02: priority di luar low/medium/high persis
 *   (case-sensitive) — termasuk kosong/null — diperlakukan medium
 *   DAN baris tertanda prioritas-tak-dikenal. `urgent` TIDAK ada.
 * - BR-CRM-03: awal `createdAt`; respons tercapai = `firstResponseAt`
 *   terisi (semantik existing "pertama keluar dari open"); resolusi
 *   tercapai = `resolvedAt` terisi; `deletedAt` terisi selalu
 *   dikecualikan. Prioritas berubah -> target dihitung ulang dari
 *   priority berjalan terhadap `createdAt` yang sama (EC-4).
 *
 * Keadaan per tiket aktif (open/in_progress): `RESPONS` berjalan
 * selama status open DAN firstResponseAt kosong; `RESOLUSI` berjalan
 * selama resolvedAt kosong. Satu tiket bisa lewat keduanya (open lama
 * tanpa respons); `primaryState` = paling parah dengan urutan
 * konsumen 001-U: lewat-resolusi > lewat-respons >
 * mendekati-resolusi > mendekati-respons > dalam-sla.
 *
 * Tenggat (`responseDueAt`/`resolutionDueAt`) = createdAt + target
 * jam kerja — diturunkan dengan fungsi jam-kerja yang sama supaya
 * UI (001-U) tidak menghitung ulang. Tiket dibuat di luar jam kerja:
 * jam mulai berjalan pada jam kerja berikutnya (BR-CRM-05/EC-1,
 * konsekuensi alami hitungan jam kerja).
 *
 * Baca-saja: builder/loader TIDAK menulis tiket/kolom apa pun.
 * Loader: `crm-ticket-sla-data.ts`.
 */

import { wibDateKeyParts, wibPartsKey } from "@/lib/utils/format"

export const CRM_TICKET_SLA_EMPTY_TEXT = "Tidak ada tiket lewat SLA — semua tiket aktif masih dalam target"

export const CRM_TICKET_SLA_NOTICE_TEXT =
  "Keadaan SLA dihitung dari jam kerja Senin–Jumat 08:00–17:00 WIB (di luar tanggal libur) sejak tiket dibuat. Daftar ini baca-saja; tindak lanjut lewat detail tiket."

export const CRM_TICKET_SLA_WORK_START_HOUR_WIB = 8
export const CRM_TICKET_SLA_WORK_END_HOUR_WIB = 17
/** Menit jam kerja per hari kerja (08:00–17:00). */
export const CRM_TICKET_SLA_WORK_MINUTES_PER_DAY = 540

/** Ambang mendekati BR-CRM-03: sisa <= 25% target dan belum lewat. */
export const CRM_TICKET_SLA_NEAR_RATIO = 0.25

export type CrmTicketSlaPriorityKey = "HIGH" | "MEDIUM" | "LOW"

/** Target dalam menit jam kerja per prioritas efektif (BR-CRM-01 tersahkan). */
export const CRM_TICKET_SLA_TARGETS_MINUTES: Record<
  CrmTicketSlaPriorityKey,
  { response: number; resolution: number }
> = {
  HIGH: { response: 120, resolution: 540 },
  MEDIUM: { response: 240, resolution: 1620 },
  LOW: { response: 480, resolution: 2700 },
}

const ACTIVE_STATUSES = new Set(["open", "in_progress"])

export type CrmTicketSlaPhaseState =
  | "DALAM_SLA"
  | "MENDEKATI"
  | "LEWAT"
  /** Fase sudah tercapai (timestamp terisi) — tidak dinilai lagi. */
  | "TERCAPAI"
  /** Tiket resolved/closed: keluar penilaian aktif. */
  | "SELESAI"

export type CrmTicketSlaPrimaryState =
  | "DALAM_SLA"
  | "MENDEKATI_RESPONS"
  | "MENDEKATI_RESOLUSI"
  | "LEWAT_RESPONS"
  | "LEWAT_RESOLUSI"

const PRIMARY_RANK: Record<CrmTicketSlaPrimaryState, number> = {
  LEWAT_RESOLUSI: 0,
  LEWAT_RESPONS: 1,
  MENDEKATI_RESOLUSI: 2,
  MENDEKATI_RESPONS: 3,
  DALAM_SLA: 4,
}

// ---------------------------------------------------------------------
// Jam kerja WIB — murni, tanpa Prisma.
// Semua konversi lewat Intl Asia/Jakarta supaya bebas zona waktu
// proses/CI. Ketelitian menit (target dan tenggat kelipatan menit).
// Pemformat mentah dihapus (AC-REP-003): delegasi ke wibDateKeyParts/
// wibPartsKey di src/lib/utils/format.ts.
// ---------------------------------------------------------------------

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
}

const MINUTE_MS = 60_000
const DAY_MS = 86_400_000

/**
 * Kunci tanggal kalender WIB "YYYY-MM-DD" — samakan dengan tanggal Holiday.
 * Mesin SLA (bukan label tampilan): delegasi ke wibDateKeyParts di
 * src/lib/utils/format.ts, satu-satunya rumah Intl mentah (ALLOWLIST ratchet).
 */
export function wibDateKey(date: Date): string {
  const { year, month, day } = wibDateKeyParts(date)
  return `${year}-${month}-${day}`
}

interface WibParts {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  /** 0=Minggu .. 6=Sabtu. */
  weekday: number
}

function wibParts(date: Date): WibParts {
  const p = wibPartsKey(date)
  return {
    year: p.year,
    month: p.month,
    day: p.day,
    hour: p.hour % 24,
    minute: p.minute,
    weekday: WEEKDAY_INDEX[p.weekday] ?? 0,
  }
}

/**
 * Instant (ms) untuk dinding-jam WIB y-m-d h:mi. Offset WIB tetap
 * UTC+7 (tanpa DST) — diverifikasi dari instant acuan, bukan ditebak.
 */
function wibInstantMs(year: number, month: number, day: number, hour: number, minute: number): number {
  const naiveUtc = Date.UTC(year, month - 1, day, hour, minute)
  const probe = wibParts(new Date(naiveUtc))
  const probeAsUtc = Date.UTC(probe.year, probe.month - 1, probe.day, probe.hour, probe.minute)
  return naiveUtc - (probeAsUtc - naiveUtc)
}

function nextWibDay(year: number, month: number, day: number): { year: number; month: number; day: number } {
  const next = new Date(Date.UTC(year, month - 1, day) + DAY_MS)
  return { year: next.getUTCFullYear(), month: next.getUTCMonth() + 1, day: next.getUTCDate() }
}

function isWorkDay(parts: { weekday: number }, dateKey: string, holidays: ReadonlySet<string>): boolean {
  if (parts.weekday < 1 || parts.weekday > 5) return false
  return !holidays.has(dateKey)
}

/**
 * Menit jam kerja terpakai dari `from` sampai `to` (menit bulat ke
 * bawah; 0 bila `to <= from` atau seluruh rentang di luar jam kerja).
 */
export function workingMinutesBetween(
  from: Date,
  to: Date,
  holidayDates: readonly Date[],
): number {
  if (to.getTime() <= from.getTime()) return 0
  const holidays = new Set(holidayDates.map(wibDateKey))
  let total = 0
  let cursor = { ...wibParts(from) }
  const endMs = to.getTime()
  // Batas pengaman: rentang tiket wajar jauh di bawah 10 tahun hari kerja.
  for (let guard = 0; guard < 3700; guard += 1) {
    const key = `${cursor.year}-${String(cursor.month).padStart(2, "0")}-${String(cursor.day).padStart(2, "0")}`
    const dayStartMs = wibInstantMs(cursor.year, cursor.month, cursor.day, 0, 0)
    if (dayStartMs >= endMs) break
    if (isWorkDay(cursor, key, holidays)) {
      const winStart = wibInstantMs(
        cursor.year,
        cursor.month,
        cursor.day,
        CRM_TICKET_SLA_WORK_START_HOUR_WIB,
        0,
      )
      const winEnd = wibInstantMs(
        cursor.year,
        cursor.month,
        cursor.day,
        CRM_TICKET_SLA_WORK_END_HOUR_WIB,
        0,
      )
      const overlapStart = Math.max(from.getTime(), winStart)
      const overlapEnd = Math.min(endMs, winEnd)
      if (overlapEnd > overlapStart) total += Math.floor((overlapEnd - overlapStart) / MINUTE_MS)
    }
    cursor = { ...nextWibDay(cursor.year, cursor.month, cursor.day), hour: 0, minute: 0, weekday: (cursor.weekday + 1) % 7 }
  }
  return total
}

/**
 * Tenggat: instant saat `minutes` menit jam kerja sesudah `from`
 * tercapai. `from` di luar jam kerja -> hitung mulai jendela kerja
 * berikutnya (BR-CRM-05/EC-1). `minutes <= 0` -> `from` apa adanya.
 */
export function addWorkingMinutes(
  from: Date,
  minutes: number,
  holidayDates: readonly Date[],
): Date {
  if (minutes <= 0) return new Date(from.getTime())
  const holidays = new Set(holidayDates.map(wibDateKey))
  let remaining = minutes
  let cursor = { ...wibParts(from) }
  for (let guard = 0; guard < 3700; guard += 1) {
    const key = `${cursor.year}-${String(cursor.month).padStart(2, "0")}-${String(cursor.day).padStart(2, "0")}`
    if (isWorkDay(cursor, key, holidays)) {
      const winStart = wibInstantMs(
        cursor.year,
        cursor.month,
        cursor.day,
        CRM_TICKET_SLA_WORK_START_HOUR_WIB,
        0,
      )
      const winEnd = wibInstantMs(
        cursor.year,
        cursor.month,
        cursor.day,
        CRM_TICKET_SLA_WORK_END_HOUR_WIB,
        0,
      )
      const segmentStart = Math.max(from.getTime(), winStart)
      if (segmentStart < winEnd) {
        const available = Math.floor((winEnd - segmentStart) / MINUTE_MS)
        if (remaining <= available) return new Date(segmentStart + remaining * MINUTE_MS)
        remaining -= available
      }
    }
    cursor = { ...nextWibDay(cursor.year, cursor.month, cursor.day), hour: 0, minute: 0, weekday: (cursor.weekday + 1) % 7 }
  }
  return new Date(from.getTime())
}

// ---------------------------------------------------------------------
// Builder keadaan SLA per tiket + antrean lewat-SLA.
// ---------------------------------------------------------------------

export interface CrmTicketSlaInput {
  id: number
  slug: string | null
  ticketNumber: string | null
  subject: string
  priority: string | null
  status: string
  customerName: string | null
  assignedTo: number | null
  /** Nama penanggung ter-resolusi loader; null bila belum ditugaskan. */
  assignedToName: string | null
  createdAt: Date
  firstResponseAt: Date | null
  resolvedAt: Date | null
  deletedAt: Date | null
}

export interface CrmTicketSlaPhase {
  targetMinutes: number
  /** Menit jam kerja terpakai createdAt -> titik nilai (now / timestamp tercapai). */
  usedMinutes: number
  /** Sisa menit jam kerja; negatif = kelebihan (lewat). Null bila fase selesai historis. */
  remainingMinutes: number | null
  state: CrmTicketSlaPhaseState
  /** Tenggat jam kerja; null bila fase tidak dinilai (tiket selesai). */
  dueAt: Date | null
}

export interface CrmTicketSlaRow {
  ticketId: number
  slug: string | null
  ticketNumber: string | null
  subject: string
  /** Nilai prioritas apa adanya dari rekod. */
  priority: string | null
  /** Prioritas efektif sesudah aturan BR-CRM-02. */
  effectivePriorityKey: CrmTicketSlaPriorityKey
  /** True bila priority di luar low/medium/high persis (BR-CRM-02). */
  isUnknownPriority: boolean
  status: string
  customerName: string | null
  assignedTo: number | null
  assignedToName: string | null
  createdAt: Date
  firstResponseAt: Date | null
  resolvedAt: Date | null
  response: CrmTicketSlaPhase
  resolution: CrmTicketSlaPhase
  primaryState: CrmTicketSlaPrimaryState
  /** Kelebihan menit jam kerja fase primer (0 bila belum lewat). */
  overdueMinutes: number
  isOverdue: boolean
  /** Tenggat fase primer untuk tampilan antrean. */
  dueAt: Date | null
}

export interface CrmTicketSlaSummary {
  activeCount: number
  overdueResponseCount: number
  overdueResolutionCount: number
  overdueCount: number
  nearCount: number
  unknownPriorityCount: number
}

export interface CrmTicketSlaResult {
  /** Semua tiket aktif non-deleted dengan keadaan SLA (urutan input). */
  rows: CrmTicketSlaRow[]
  /** Antrean lewat-SLA: kelebihan terbesar dulu; seri ticketNumber lalu id (AC-BE 5). */
  overdueQueue: CrmTicketSlaRow[]
  summary: CrmTicketSlaSummary
  emptyText: string
  noticeText: string
}

function effectivePriority(priority: string | null): {
  key: CrmTicketSlaPriorityKey
  isUnknown: boolean
} {
  if (priority === "high") return { key: "HIGH", isUnknown: false }
  if (priority === "medium") return { key: "MEDIUM", isUnknown: false }
  if (priority === "low") return { key: "LOW", isUnknown: false }
  return { key: "MEDIUM", isUnknown: true }
}

function phaseState(used: number, target: number): CrmTicketSlaPhaseState {
  if (used > target) return "LEWAT"
  if (target - used <= target * CRM_TICKET_SLA_NEAR_RATIO) return "MENDEKATI"
  return "DALAM_SLA"
}

function buildRow(
  input: CrmTicketSlaInput,
  now: Date,
  holidayDates: readonly Date[],
): CrmTicketSlaRow {
  const { key, isUnknown } = effectivePriority(input.priority)
  const targets = CRM_TICKET_SLA_TARGETS_MINUTES[key]
  const isActive = ACTIVE_STATUSES.has(input.status)

  const responseDueAt = addWorkingMinutes(input.createdAt, targets.response, holidayDates)
  const resolutionDueAt = addWorkingMinutes(input.createdAt, targets.resolution, holidayDates)

  let response: CrmTicketSlaPhase
  if (input.firstResponseAt != null) {
    const used = workingMinutesBetween(input.createdAt, input.firstResponseAt, holidayDates)
    response = {
      targetMinutes: targets.response,
      usedMinutes: used,
      remainingMinutes: null,
      state: "TERCAPAI",
      dueAt: responseDueAt,
    }
  } else if (!isActive) {
    response = {
      targetMinutes: targets.response,
      usedMinutes: workingMinutesBetween(input.createdAt, now, holidayDates),
      remainingMinutes: null,
      state: "SELESAI",
      dueAt: null,
    }
  } else {
    const used = workingMinutesBetween(input.createdAt, now, holidayDates)
    response = {
      targetMinutes: targets.response,
      usedMinutes: used,
      remainingMinutes: targets.response - used,
      state: phaseState(used, targets.response),
      dueAt: responseDueAt,
    }
  }

  let resolution: CrmTicketSlaPhase
  if (input.resolvedAt != null) {
    const used = workingMinutesBetween(input.createdAt, input.resolvedAt, holidayDates)
    resolution = {
      targetMinutes: targets.resolution,
      usedMinutes: used,
      remainingMinutes: null,
      state: "TERCAPAI",
      dueAt: resolutionDueAt,
    }
  } else if (!isActive) {
    resolution = {
      targetMinutes: targets.resolution,
      usedMinutes: workingMinutesBetween(input.createdAt, now, holidayDates),
      remainingMinutes: null,
      state: "SELESAI",
      dueAt: null,
    }
  } else {
    const used = workingMinutesBetween(input.createdAt, now, holidayDates)
    resolution = {
      targetMinutes: targets.resolution,
      usedMinutes: used,
      remainingMinutes: targets.resolution - used,
      state: phaseState(used, targets.resolution),
      dueAt: resolutionDueAt,
    }
  }

  const candidates: CrmTicketSlaPrimaryState[] = []
  if (resolution.state === "LEWAT") candidates.push("LEWAT_RESOLUSI")
  if (response.state === "LEWAT") candidates.push("LEWAT_RESPONS")
  if (resolution.state === "MENDEKATI") candidates.push("MENDEKATI_RESOLUSI")
  if (response.state === "MENDEKATI") candidates.push("MENDEKATI_RESPONS")
  candidates.sort((a, b) => PRIMARY_RANK[a] - PRIMARY_RANK[b])
  const primaryState = candidates[0] ?? "DALAM_SLA"

  const primaryPhase =
    primaryState === "LEWAT_RESOLUSI" || primaryState === "MENDEKATI_RESOLUSI"
      ? resolution
      : primaryState === "LEWAT_RESPONS" || primaryState === "MENDEKATI_RESPONS"
        ? response
        : resolution.remainingMinutes != null
          ? resolution
          : response

  return {
    ticketId: input.id,
    slug: input.slug,
    ticketNumber: input.ticketNumber,
    subject: input.subject,
    priority: input.priority,
    effectivePriorityKey: key,
    isUnknownPriority: isUnknown,
    status: input.status,
    customerName: input.customerName,
    assignedTo: input.assignedTo,
    assignedToName: input.assignedToName,
    createdAt: input.createdAt,
    firstResponseAt: input.firstResponseAt,
    resolvedAt: input.resolvedAt,
    response,
    resolution,
    primaryState,
    overdueMinutes: Math.max(
      0,
      response.state === "LEWAT" ? response.usedMinutes - response.targetMinutes : 0,
      resolution.state === "LEWAT" ? resolution.usedMinutes - resolution.targetMinutes : 0,
    ),
    isOverdue: response.state === "LEWAT" || resolution.state === "LEWAT",
    dueAt: primaryPhase.dueAt,
  }
}

function byOverdueNumberId(a: CrmTicketSlaRow, b: CrmTicketSlaRow): number {
  const overdue = b.overdueMinutes - a.overdueMinutes
  if (overdue !== 0) return overdue
  if (a.ticketNumber == null && b.ticketNumber != null) return 1
  if (a.ticketNumber != null && b.ticketNumber == null) return -1
  if (a.ticketNumber != null && b.ticketNumber != null && a.ticketNumber !== b.ticketNumber) {
    return a.ticketNumber < b.ticketNumber ? -1 : 1
  }
  return a.ticketId - b.ticketId
}

export function buildCrmTicketSla(
  inputs: readonly CrmTicketSlaInput[],
  now: Date,
  holidayDates: readonly Date[],
): CrmTicketSlaResult {
  const rows: CrmTicketSlaRow[] = []
  for (const input of inputs) {
    if (input.deletedAt != null) continue
    rows.push(buildRow(input, now, holidayDates))
  }

  const activeRows = rows.filter((row) => ACTIVE_STATUSES.has(row.status))
  const overdueQueue = activeRows.filter((row) => row.isOverdue).sort(byOverdueNumberId)

  const summary: CrmTicketSlaSummary = {
    activeCount: activeRows.length,
    overdueResponseCount: activeRows.filter((row) => row.response.state === "LEWAT").length,
    overdueResolutionCount: activeRows.filter((row) => row.resolution.state === "LEWAT").length,
    overdueCount: overdueQueue.length,
    nearCount: activeRows.filter(
      (row) => row.primaryState === "MENDEKATI_RESPONS" || row.primaryState === "MENDEKATI_RESOLUSI",
    ).length,
    unknownPriorityCount: rows.filter((row) => row.isUnknownPriority).length,
  }

  return {
    rows,
    overdueQueue,
    summary,
    emptyText: CRM_TICKET_SLA_EMPTY_TEXT,
    noticeText: CRM_TICKET_SLA_NOTICE_TEXT,
  }
}

/** Menit jam kerja tersedia pada tanggal WIB tertentu (540 hari kerja, 0 selainnya). */
export function workingMinutesOnWibDate(date: Date, holidayDates: readonly Date[]): number {
  const holidays = new Set(holidayDates.map(wibDateKey))
  const parts = wibParts(date)
  return isWorkDay(parts, wibDateKey(date), holidays) ? CRM_TICKET_SLA_WORK_MINUTES_PER_DAY : 0
}
