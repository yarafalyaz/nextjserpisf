/**
 * F-2026-10-25-033-S — rekap beban tiket terbuka per penanggung jawab
 * (baca-saja, lapis aman: agregat murni di atas populasi 032-S).
 *
 * Memakai persis populasi/turutan/umur F-2026-10-25-032-S
 * (`buildCrmTicketQueue`, BR-CTB-02 — dilarang definisi populasi
 * kedua): total seluruh kelompok + `Belum ditugaskan` = total antrean.
 *
 * Per kelompok (spec §2): total terbuka, rincian per tingkat prioritas
 * (tingkat terakhir = "Prioritas tak dikenal", tidak dinormalisasi),
 * jumlah belum direspons (BR-CTQ-12), umur tiket tertua (`createdAt`).
 *
 * Bukan penilaian kinerja (BR-CTB-07): tidak ada target/ambang/
 * peringkat dalam teks builder. Urutan BR-CTB-05: `Belum ditugaskan`
 * → high desc → total desc → umur tertua desc → nama → id.
 * Label penanggung: `assignedTo` = User, ditampilkan `User.name`;
 * tidak ditemukan → `Pengguna #<id>` (BR-CTB-04, fallback existing).
 * Hanya pemegang beban aktual yang tampil; orang nol tiket tidak
 * menjadi kelompok (spec §4). Penanggung tak ditemukan (assignedTo
 * ada, nama null) dikelompokkan per id itu juga.
 */

import {
  CRM_TICKET_PRIORITY_LABELS,
  CRM_TICKET_QUEUE_AGE_LABEL,
  CRM_TICKET_UNASSIGNED_LABEL,
  type CrmTicketPriorityKey,
  type CrmTicketQueueRow,
} from "@/lib/reports/crm-ticket-queue"

export const CRM_TICKET_WORKLOAD_NOTICE_TEXT =
  "Rekap beban tiket terbuka per penanggung jawab untuk pembagian beban operasional. Baca-saja; penugasan ulang lewat detail tiket."

export const CRM_TICKET_WORKLOAD_EMPTY_NAMED_TEXT = "Tidak ada penanggung jawab dengan tiket terbuka"

export interface CrmTicketWorkloadGroup {
  assignedTo: number | null
  assigneeLabel: string
  totalOpen: number
  highCount: number
  mediumCount: number
  lowCount: number
  unknownPriorityCount: number
  unrespondedCount: number
  /** createdAt tertua di kelompok, null bila kelompok kosong. */
  oldestCreatedAt: Date | null
  /** Age tertua kalender (ms), >= 0; null bila kelompok kosong. */
  oldestAgeMs: number | null
}

export interface CrmTicketWorkload {
  groups: CrmTicketWorkloadGroup[]
  summary: { totalOpen: number; unassignedCount: number }
  ageLabel: string
  unassignedLabel: string
  priorityLabels: Record<CrmTicketPriorityKey, string>
  noticeText: string
  emptyNamedText: string
}

function buildGroups(rows: readonly CrmTicketQueueRow[], now: Date): CrmTicketWorkloadGroup[] {
  const byKey = new Map<string, CrmTicketWorkloadGroup & { oldestAgeMsSort: number }>()
  const unnamed = (assignedTo: number | null, label: string) => {
    const key = assignedTo == null ? "null" : `id:${assignedTo}`
    let g = byKey.get(key)
    if (!g) {
      g = {
        assignedTo,
        assigneeLabel: label,
        totalOpen: 0,
        highCount: 0, mediumCount: 0, lowCount: 0, unknownPriorityCount: 0,
        unrespondedCount: 0,
        oldestCreatedAt: null,
        oldestAgeMs: null,
        oldestAgeMsSort: -1,
      }
      byKey.set(key, g)
    }
    return g
  }
  for (const row of rows) {
    const g = unnamed(row.assignedTo, row.assigneeLabel)
    g.totalOpen += 1
    if (row.priorityKey === "HIGH") g.highCount += 1
    else if (row.priorityKey === "MEDIUM") g.mediumCount += 1
    else if (row.priorityKey === "LOW") g.lowCount += 1
    else g.unknownPriorityCount += 1
    if (row.isUnresponded) g.unrespondedCount += 1
    if (g.oldestCreatedAt == null || row.createdAt.getTime() < g.oldestCreatedAt.getTime()) {
      g.oldestCreatedAt = row.createdAt
      g.oldestAgeMs = Math.max(0, now.getTime() - row.createdAt.getTime())
      g.oldestAgeMsSort = g.oldestAgeMs
    }
  }
  const groups = Array.from(byKey.values())
  // Ensure ember exists even when empty (AC-CTB-B2).
  if (!byKey.has("null")) {
    groups.push({
      assignedTo: null,
      assigneeLabel: CRM_TICKET_UNASSIGNED_LABEL,
      totalOpen: 0, highCount: 0, mediumCount: 0, lowCount: 0, unknownPriorityCount: 0, unrespondedCount: 0,
      oldestCreatedAt: null, oldestAgeMs: null, oldestAgeMsSort: -1,
    })
  }
  groups.sort((a, b) => {
    const aUn = a.assignedTo == null ? 0 : 1
    const bUn = b.assignedTo == null ? 0 : 1
    if (aUn !== bUn) return aUn - bUn
    if (a.highCount !== b.highCount) return b.highCount - a.highCount
    if (a.totalOpen !== b.totalOpen) return b.totalOpen - a.totalOpen
    if (a.oldestAgeMsSort !== b.oldestAgeMsSort) return b.oldestAgeMsSort - a.oldestAgeMsSort
    const name = a.assigneeLabel.localeCompare(b.assigneeLabel, "id-ID")
    if (name !== 0) return name
    return (a.assignedTo ?? -1) - (b.assignedTo ?? -1)
  })
  return groups.map(({ oldestAgeMsSort: _omit, ...g }) => g)
}

/**
 * Agregat per penanggung jawab di atas baris hasil
 * `buildCrmTicketQueue` (satu populasi, satu-query lewat loader 032).
 * Sekarang memakai `now` yang sama agar umur tertua per kelompok
 * konsisten dengan `ageMs` baris.
 */
export function buildCrmTicketWorkload(
  rows: readonly CrmTicketQueueRow[],
  now: Date = new Date(),
): CrmTicketWorkload {
  const groups = buildGroups(rows, now)
  const unassigned = groups.find((g) => g.assignedTo == null)
  return {
    groups,
    summary: {
      totalOpen: groups.reduce((acc, g) => acc + g.totalOpen, 0),
      unassignedCount: unassigned?.totalOpen ?? 0,
    },
    ageLabel: CRM_TICKET_QUEUE_AGE_LABEL,
    unassignedLabel: CRM_TICKET_UNASSIGNED_LABEL,
    priorityLabels: CRM_TICKET_PRIORITY_LABELS,
    noticeText: CRM_TICKET_WORKLOAD_NOTICE_TEXT,
    emptyNamedText: CRM_TICKET_WORKLOAD_EMPTY_NAMED_TEXT,
  }
}
