/**
 * Loader read-only rekod disiplin karyawan (F-2026-10-25-005-S DISC-B1).
 *
 * Satu query massal EmployeeDisciplinaryRecord dalam scope HR pemanggil
 * lewat `hrScopeWhere` existing — scope diterapkan di server pada query
 * yang sama (AC-DISC-5 fail-closed: self hanya rekod dirinya, department
 * se-departemen, roles rusak dari getHrScope = self -1 = nol baris).
 * Status baca active|expired + masa berlaku TURUNAN dari builder murni
 * disciplinary.ts (BR-DISC-03); loader tidak menghitung ulang.
 *
 * Select TIDAK memuat field gaji/nominal apa pun (BR-DISC-08, AC-DISC-8):
 * Employee hanya dibaca name + department name. Hanya baca: nol mutasi.
 * Rekod pembatal (voidOfId terisi) ditandai apa adanya untuk UI; rantai
 * jenjang di aksi mengecualikannya lewat voidedAt (BR-DISC-10).
 */

import { prisma } from "@/lib/db/prisma"
import { hrScopeWhere, type HrScope } from "@/lib/auth/hr-scope"
import {
  deriveDisciplinaryStatus,
  disciplinaryExpiryDate,
  summarizeDisciplinaryAttention,
  DISCIPLINARY_LEVEL_LABELS,
  isDisciplinaryLevel,
  type DisciplinaryDerivedStatus,
  type DisciplinaryRecordLike,
} from "@/lib/reports/disciplinary"

export interface DisciplinaryRecordRow {
  id: number
  employeeId: number
  employeeName: string
  departmentName: string | null
  level: string
  levelLabel: string | null
  violationCategory: string
  violationDate: Date
  description: string
  regulationReference: string | null
  workflowStatus: string
  derivedStatus: DisciplinaryDerivedStatus
  requestedBy: number
  requesterName: string | null
  approvedBy: number | null
  secondApprovedBy: number | null
  issuedAt: Date | null
  expiresAt: Date | null
  documentNo: string | null
  rejectionReason: string | null
  acknowledgmentAt: Date | null
  acknowledgmentMethod: string | null
  acknowledgmentRefused: boolean
  employeeResponse: string | null
  employeeResponseAt: Date | null
  employeeResponseLate: boolean
  isVoidRecord: boolean
  voidedAt: Date | null
  voidReason: string | null
  createdAt: Date
}

export interface DisciplinaryAttentionLists {
  active: DisciplinaryRecordRow[]
  expiringWithin30Days: DisciplinaryRecordRow[]
  highestRisk: DisciplinaryRecordRow[]
}

const RECORD_SELECT = {
  id: true,
  employeeId: true,
  level: true,
  violationCategory: true,
  violationDate: true,
  description: true,
  regulationReference: true,
  workflowStatus: true,
  requestedBy: true,
  approvedBy: true,
  secondApprovedBy: true,
  issuedAt: true,
  documentNo: true,
  rejectionReason: true,
  acknowledgmentAt: true,
  acknowledgmentMethod: true,
  acknowledgmentRefused: true,
  employeeResponse: true,
  employeeResponseAt: true,
  employeeResponseLate: true,
  voidOfId: true,
  voidedAt: true,
  voidReason: true,
  createdAt: true,
  employee: { select: { name: true, department: { select: { name: true } } } },
  requester: { select: { name: true } },
} as const

type RecordRow = {
  id: number
  employeeId: number
  level: string
  violationCategory: string
  violationDate: Date
  description: string
  regulationReference: string | null
  workflowStatus: string
  requestedBy: number
  approvedBy: number | null
  secondApprovedBy: number | null
  issuedAt: Date | null
  documentNo: string | null
  rejectionReason: string | null
  acknowledgmentAt: Date | null
  acknowledgmentMethod: string | null
  acknowledgmentRefused: boolean
  employeeResponse: string | null
  employeeResponseAt: Date | null
  employeeResponseLate: boolean
  voidOfId: number | null
  voidedAt: Date | null
  voidReason: string | null
  createdAt: Date
  employee: { name: string; department: { name: string } | null }
  requester: { name: string } | null
}

function toRow(r: RecordRow, at: Date): DisciplinaryRecordRow {
  const level = isDisciplinaryLevel(r.level) ? r.level : null
  return {
    id: r.id,
    employeeId: r.employeeId,
    employeeName: r.employee.name,
    departmentName: r.employee.department?.name ?? null,
    level: r.level,
    levelLabel: level ? DISCIPLINARY_LEVEL_LABELS[level] : null,
    violationCategory: r.violationCategory,
    violationDate: r.violationDate,
    description: r.description,
    regulationReference: r.regulationReference,
    workflowStatus: r.workflowStatus,
    derivedStatus: deriveDisciplinaryStatus(
      {
        workflowStatus: r.workflowStatus as DisciplinaryRecordLike["workflowStatus"],
        issuedAt: r.issuedAt,
      },
      at,
    ),
    requestedBy: r.requestedBy,
    requesterName: r.requester?.name ?? null,
    approvedBy: r.approvedBy,
    secondApprovedBy: r.secondApprovedBy,
    issuedAt: r.issuedAt,
    expiresAt: r.issuedAt ? disciplinaryExpiryDate(r.issuedAt) : null,
    documentNo: r.documentNo,
    rejectionReason: r.rejectionReason,
    acknowledgmentAt: r.acknowledgmentAt,
    acknowledgmentMethod: r.acknowledgmentMethod,
    acknowledgmentRefused: r.acknowledgmentRefused,
    employeeResponse: r.employeeResponse,
    employeeResponseAt: r.employeeResponseAt,
    employeeResponseLate: r.employeeResponseLate,
    isVoidRecord: r.voidOfId != null,
    voidedAt: r.voidedAt,
    voidReason: r.voidReason,
    createdAt: r.createdAt,
  }
}

export async function loadDisciplinaryRecords(
  scope: HrScope,
  at: Date = new Date(),
): Promise<DisciplinaryRecordRow[]> {
  const rows = await prisma.employeeDisciplinaryRecord.findMany({
    where: { deletedAt: null, ...hrScopeWhere(scope) },
    select: RECORD_SELECT,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  })
  return rows.map((r) => toRow(r as RecordRow, at))
}

/** Daftar perhatian HR (§1.7): turunan builder, bukan status tersimpan. */
export async function loadDisciplinaryAttention(
  scope: HrScope,
  at: Date = new Date(),
): Promise<DisciplinaryAttentionLists> {
  const rows = await loadDisciplinaryRecords(scope, at)
  const likes: DisciplinaryRecordLike[] = rows
    .filter((r) => isDisciplinaryLevel(r.level))
    .map((r) => ({
      id: r.id,
      employeeId: r.employeeId,
      level: r.level as DisciplinaryRecordLike["level"],
      workflowStatus: r.workflowStatus as DisciplinaryRecordLike["workflowStatus"],
      violationDate: r.violationDate,
      issuedAt: r.issuedAt,
      voidedAt: r.voidedAt,
    }))
  const summary = summarizeDisciplinaryAttention(likes, at)
  const byId = new Map(rows.map((r) => [r.id, r]))
  const pick = (list: DisciplinaryRecordLike[]) =>
    list.map((r) => byId.get(r.id)).filter((r): r is DisciplinaryRecordRow => r != null)
  return {
    active: pick(summary.active),
    expiringWithin30Days: pick(summary.expiringWithin30Days),
    highestRisk: pick(summary.highestRisk),
  }
}
