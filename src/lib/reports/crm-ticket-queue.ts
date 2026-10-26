/**
 * F-2026-10-25-032-S — antrean tiket CRM terbuka per prioritas + umur
 * (baca-saja, lapis aman: builder murni + loader massal, tanpa
 * migrasi/kolom/status baru/aksi tulis).
 *
 * Populasi href: BR-CTQ-02 status `open`/`in_progress` non-terminal,
 * `deletedAt IS NULL` — himpunan global, bukan subset halaman daftar
 * tiket existing. Beda tegas dari SLA F-2026-10-24-135-S: antrean ini
 * TANPA target waktu, TANPA ambang, TANPA keadaan "terlambat" (BR-CTQ-07);
 * urutannya hanya jawaban "tiket terbuka mana dikerjakan lebih dulu".
 *
 * Tingkat prioritas BR-CTQ-03: `high` → `medium` → `low` persis
 * case-sensitive. Nilai lain/kosong = tingkat terakhir tertanda
 * "Prioritas tak dikenal" — TIDAK dinormalisasi diam-diam ke medium.
 * Urutan deterministik BR-CTQ-04: tingkat → `createdAt` asc (tertua
 * dulu) → `ticketNumber` asc (null terakhir) → `id` asc. Loader/UI
 * dilarang mengurutkan ulang.
 *
 * Umur BR-CTQ-05: turunan `createdAt` kalender (timestamp mentah,
 * bukan `updatedAt`, bukan jam kerja), berlabel "Umur sejak dibuat".
 * `ageMs` negatif (createdAt di masa depan / jam mundur) dijepit ke 0
 * supaya permukaan tidak menampilkan umur negatif karangan.
 *
 * Status liar (di luar kosakata validasi existing) tetap tampil satu
 * baris dalam tingkat prioritasnya, sesudah `in_progress`, tertanda
 * "Status tidak dikenal" (§4 spec); tidak dipetakan paksa.
 * `isUnresponded` persis BR-CTQ-12: `status=open AND firstResponseAt
 * IS NULL` apa adanya (semantik existing "keluar dari open").
 *
 * Builder populasi ini juga fondasi rekap beban F-2026-10-25-033-S
 * (BR-CTB-02: populasi yang sama, dilarang definisi kedua) — agregat
 * per penanggung jawab dibangun di atas keluaran builder ini.
 * Loader: `crm-ticket-queue-data.ts`.
 */

export const CRM_TICKET_QUEUE_AGE_LABEL = "Umur sejak dibuat"

export const CRM_TICKET_QUEUE_EMPTY_TEXT = "Tidak ada tiket terbuka"

export const CRM_TICKET_QUEUE_NOTICE_TEXT =
  "Antrean tiket terbuka terurut prioritas lalu umur sejak dibuat. Daftar ini baca-saja dan bukan penilaian terhadap target waktu; tindak lanjut lewat detail tiket."

export const CRM_TICKET_PRIORITY_KEYS = ["HIGH", "MEDIUM", "LOW", "UNKNOWN"] as const

export type CrmTicketPriorityKey = (typeof CRM_TICKET_PRIORITY_KEYS)[number]

export const CRM_TICKET_PRIORITY_LABELS: Record<CrmTicketPriorityKey, string> = {
  HIGH: "Tinggi",
  MEDIUM: "Sedang",
  LOW: "Rendah",
  UNKNOWN: "Prioritas tak dikenal",
}

export const CRM_TICKET_UNKNOWN_STATUS_LABEL = "Status tidak dikenal"

export const CRM_TICKET_UNASSIGNED_LABEL = "Belum ditugaskan"

/**
 * Fallback nama penanggung tak ditemukan — persis detail tiket existing
 * (`crm/tickets/[slug]/page.tsx`: `Pengguna #<id>`); baris tetap tampil,
 * tidak digabung ke ember belum-ditugaskan (beda BR-CTB-04 spec 033-S).
 */
export function crmTicketAssigneeFallbackLabel(assignedTo: number): string {
  return `Pengguna #${assignedTo}`
}

export const CRM_TICKET_NO_CUSTOMER_LABEL = "—"

const OPEN_STATUSES = new Set(["open", "in_progress"])
const KNOWN_STATUSES = new Set(["open", "in_progress", "resolved", "closed"])

const TICKET_STATUS_LABELS: Record<string, string> = {
  open: "Terbuka",
  in_progress: "Dalam Pengerjaan",
  resolved: "Selesai",
  closed: "Ditutup",
}

const PRIORITY_RANK: Record<CrmTicketPriorityKey, number> = {
  HIGH: 0,
  MEDIUM: 1,
  LOW: 2,
  UNKNOWN: 3,
}

function priorityKeyOf(priority: string | null): CrmTicketPriorityKey {
  if (priority === "high") return "HIGH"
  if (priority === "medium") return "MEDIUM"
  if (priority === "low") return "LOW"
  return "UNKNOWN"
}

function statusRankOf(status: string): number {
  if (status === "open") return 0
  if (status === "in_progress") return 1
  return 2
}

export interface CrmTicketQueueInput {
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
  firstResponseAt: Date | null
  createdAt: Date
  deletedAt: Date | null
}

export interface CrmTicketQueueRow {
  ticketId: number
  slug: string | null
  ticketNumber: string | null
  subject: string
  /** Nilai prioritas apa adanya dari rekod. */
  priority: string | null
  priorityKey: CrmTicketPriorityKey
  priorityLabel: string
  status: string
  statusLabel: string
  isUnknownStatus: boolean
  customerName: string | null
  customerLabel: string
  assignedTo: number | null
  assignedToName: string | null
  assigneeLabel: string
  createdAt: Date
  /** Umur kalender sejak createdAt dalam milidetik, >= 0 (BR-CTQ-05). */
  ageMs: number
  ageLabel: string
  /** Persis BR-CTQ-12: status=open AND firstResponseAt IS NULL. */
  isUnresponded: boolean
}

export interface CrmTicketQueueSummary {
  totalOpen: number
  highCount: number
  mediumCount: number
  lowCount: number
  unknownPriorityCount: number
  unassignedCount: number
  unrespondedCount: number
}

export interface CrmTicketQueue {
  rows: CrmTicketQueueRow[]
  summary: CrmTicketQueueSummary
  ageLabel: string
  emptyText: string
  noticeText: string
}

function buildRow(input: CrmTicketQueueInput, now: Date): CrmTicketQueueRow {
  const priorityKey = priorityKeyOf(input.priority)
  const isUnknownStatus = !KNOWN_STATUSES.has(input.status)
  const ageMs = Math.max(0, now.getTime() - input.createdAt.getTime())
  return {
    ticketId: input.id,
    slug: input.slug,
    ticketNumber: input.ticketNumber,
    subject: input.subject,
    priority: input.priority,
    priorityKey,
    priorityLabel: CRM_TICKET_PRIORITY_LABELS[priorityKey],
    status: input.status,
    statusLabel: isUnknownStatus
      ? CRM_TICKET_UNKNOWN_STATUS_LABEL
      : (TICKET_STATUS_LABELS[input.status] ?? CRM_TICKET_UNKNOWN_STATUS_LABEL),
    isUnknownStatus,
    customerName: input.customerName,
    customerLabel: input.customerName ?? CRM_TICKET_NO_CUSTOMER_LABEL,
    assignedTo: input.assignedTo,
    assignedToName: input.assignedToName,
    assigneeLabel:
      input.assignedToName ??
      (input.assignedTo != null
        ? crmTicketAssigneeFallbackLabel(input.assignedTo)
        : CRM_TICKET_UNASSIGNED_LABEL),
    createdAt: input.createdAt,
    ageMs,
    ageLabel: CRM_TICKET_QUEUE_AGE_LABEL,
    isUnresponded: input.status === "open" && input.firstResponseAt == null,
  }
}

function byPriorityAgeNumberId(a: CrmTicketQueueRow, b: CrmTicketQueueRow): number {
  const rank = PRIORITY_RANK[a.priorityKey] - PRIORITY_RANK[b.priorityKey]
  if (rank !== 0) return rank
  const statusRank = statusRankOf(a.status) - statusRankOf(b.status)
  if (statusRank !== 0) return statusRank
  const created = a.createdAt.getTime() - b.createdAt.getTime()
  if (created !== 0) return created
  if (a.ticketNumber == null && b.ticketNumber != null) return 1
  if (a.ticketNumber != null && b.ticketNumber == null) return -1
  if (a.ticketNumber != null && b.ticketNumber != null && a.ticketNumber !== b.ticketNumber) {
    return a.ticketNumber < b.ticketNumber ? -1 : 1
  }
  return a.ticketId - b.ticketId
}

export function buildCrmTicketQueue(
  inputs: readonly CrmTicketQueueInput[],
  now: Date,
): CrmTicketQueue {
  const rows: CrmTicketQueueRow[] = []
  for (const input of inputs) {
    if (input.deletedAt != null) continue
    // Populasi BR-CTQ-02 + status liar §4: non-terminal saja; status
    // terminal (resolved/closed/…) keluar baris dan hitungan.
    if (!OPEN_STATUSES.has(input.status) && KNOWN_STATUSES.has(input.status)) continue
    rows.push(buildRow(input, now))
  }
  rows.sort(byPriorityAgeNumberId)

  const summary: CrmTicketQueueSummary = {
    totalOpen: rows.length,
    highCount: 0,
    mediumCount: 0,
    lowCount: 0,
    unknownPriorityCount: 0,
    unassignedCount: 0,
    unrespondedCount: 0,
  }
  for (const row of rows) {
    if (row.priorityKey === "HIGH") summary.highCount += 1
    else if (row.priorityKey === "MEDIUM") summary.mediumCount += 1
    else if (row.priorityKey === "LOW") summary.lowCount += 1
    else summary.unknownPriorityCount += 1
    if (row.assignedTo == null) summary.unassignedCount += 1
    if (row.isUnresponded) summary.unrespondedCount += 1
  }

  return {
    rows,
    summary,
    ageLabel: CRM_TICKET_QUEUE_AGE_LABEL,
    emptyText: CRM_TICKET_QUEUE_EMPTY_TEXT,
    noticeText: CRM_TICKET_QUEUE_NOTICE_TEXT,
  }
}
