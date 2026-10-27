/**
 * Loader read-only antrean rekod disiplin belum terbit
 * (F-2026-10-27-095-S, putusan Lead Q-DQ-1..5,7 — kartu TASK-040).
 *
 * Gerbang `view_disciplinary_records` fail-closed SEBELUM query
 * (BR-DQ-06, pola loader antrean keluarga `performance-review-queue-data`
 * + halaman disiplin existing), lalu `getHrScope`/`hrScopeWhere`
 * fail-closed persis loader disiplin existing: self = rekod dirinya,
 * department = se-departemen, team = anggota tim, all = lintas; roles
 * rusak/hilang → self employeeId -1 → nol baris.
 *
 * SENSITIF (BR-DQ-04, AC-DQ-B2): select antrean EKSPLISIT dan TERPISAH
 * dari `RECORD_SELECT` detail di `disciplinary-data.ts` — TIDAK memuat
 * `description`/`regulationReference`/`employeeResponse`/
 * `rejectionReason`/`voidReason`, dan tidak memuat `updatedAt`
 * (BR-DQ-07: umur hanya dari `createdAt`, dihitung builder murni
 * `disciplinary-queue.ts`). Satu query massal anti-N+1 (BR-DQ-11):
 * nama karyawan/departemen/pengaju lewat relasi select massal.
 *
 * Baca-saja (BR-DQ-10) + nol potongan (BR-DQ-09): loader tidak memanggil
 * aksi disiplin/jurnal apa pun dan TIDAK membaca model keputusan
 * potongan `DisciplinaryDeductionDecision`. Tanpa key izin baru.
 */

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { getHrScope, hrScopeWhere, type HrScope } from "@/lib/auth/hr-scope"
import {
  buildDisciplinaryQueue,
  type DisciplinaryQueue,
  type DisciplinaryQueueRecordInput,
} from "@/lib/reports/disciplinary-queue"

export interface DisciplinaryQueueLoaderOptions {
  now?: Date
}

/**
 * Select antrean payload-aman (BR-DQ-04) — terpisah dari select detail.
 * Isi kasus dan `updatedAt` sengaja TIDAK dipilih.
 */
const QUEUE_SELECT = {
  id: true,
  employeeId: true,
  level: true,
  violationCategory: true,
  violationDate: true,
  workflowStatus: true,
  requestedBy: true,
  approvedBy: true,
  secondApprovedBy: true,
  documentNo: true,
  voidOfId: true,
  voidedAt: true,
  deletedAt: true,
  createdAt: true,
  employee: { select: { name: true, department: { select: { name: true } } } },
  requester: { select: { name: true } },
} as const

type QueueRow = {
  id: number
  employeeId: number
  level: string
  violationCategory: string
  violationDate: Date
  workflowStatus: string
  requestedBy: number
  approvedBy: number | null
  secondApprovedBy: number | null
  documentNo: string | null
  voidOfId: number | null
  voidedAt: Date | null
  deletedAt: Date | null
  createdAt: Date
  employee: { name: string; department: { name: string } | null }
  requester: { name: string } | null
}

export async function loadDisciplinaryQueue(
  options: DisciplinaryQueueLoaderOptions | HrScope = {},
  at?: Date,
): Promise<DisciplinaryQueue> {
  // BR-DQ-06: gerbang izin SEBELUM query apa pun (fail-closed).
  const user = await requirePermission("view_disciplinary_records")
  // Pola utama: scope diturunkan server dari user (getHrScope fail-closed).
  // Scope eksplisit pemanggil (pola loader disiplin existing) tetap dihormati.
  const isScope = (v: unknown): v is HrScope =>
    typeof v === "object" && v !== null && "kind" in v
  const scope = isScope(options) ? options : await getHrScope(user)
  const now = at ?? (isScope(options) ? undefined : options.now)

  const rows = await prisma.employeeDisciplinaryRecord.findMany({
    where: {
      workflowStatus: { in: ["draft", "pending_approval"] },
      voidedAt: null,
      deletedAt: null,
      voidOfId: null,
      ...hrScopeWhere(scope),
    },
    select: QUEUE_SELECT,
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  })

  const inputs: DisciplinaryQueueRecordInput[] = (rows as QueueRow[]).map(
    (r) => ({
      id: r.id,
      employeeId: r.employeeId,
      employeeName: r.employee.name,
      departmentName: r.employee.department?.name ?? null,
      level: r.level,
      violationCategory: r.violationCategory,
      violationDate: r.violationDate,
      workflowStatus: r.workflowStatus,
      requestedBy: r.requestedBy,
      requesterName: r.requester?.name ?? null,
      approvedBy: r.approvedBy,
      secondApprovedBy: r.secondApprovedBy,
      documentNo: r.documentNo,
      voidOfId: r.voidOfId,
      voidedAt: r.voidedAt,
      deletedAt: r.deletedAt,
      createdAt: r.createdAt,
    }),
  )

  return buildDisciplinaryQueue(inputs, { now })
}

/** Alias pola keluarga antrean (`getPerformanceQueue`). */
export const getDisciplinaryQueue = loadDisciplinaryQueue
