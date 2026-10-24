/**
 * Inti kompensasi akhir kontrak PKWT (F-2026-10-24-132-V, vonis BOT 4).
 *
 * - Peristiwa per segmen terbekukan (Putusan 1): masa 4-desimal dari tanggal,
 *   basis = pokok + tunjangan tetap (komponen fixed aktif) bulan terakhir
 *   segmen, <1 bulan ditolak, basis 0 ditolak, irisan segmen aktif ditolak.
 * - Akrual bulanan wajib (Putusan 3): subledger per karyawan-segmen-bulan +
 *   SATU jurnal agregat per bulan Dr 600028/Cr 210207 dari setting
 *   fail-closed (Putusan 2; 600005/210204 dilarang).
 * - Bayar lewat slip (Putusan 5/Q-EMP-5): baris PayrollComponentLine khusus
 *   dari peristiwa approved; nominal parsial ditolak; dokumen bayar terpisah
 *   ditolak; satu peristiwa satu baris (unik DB pkwt_event_id).
 *
 * Pajak (Putusan 4) TIDAK dibangun ulang di sini: kompensasi masuk
 * allowances slip → gross → mesin PPh 21 existing (TER bulanan / hitung
 * ulang masa terakhir berdasar employmentEndedAt server).
 */

import { prisma, type TxClient } from "@/lib/db/prisma"
import { assertPeriodOpen } from "@/lib/services/period-lock.service"
import {
  computeCompensationAmount,
  computeServiceMonths,
  planSegmentAccruals,
  PKWT_MSG,
} from "@/lib/reports/pkwt-compensation"
import { safeRound } from "@/lib/utils/math"

type Client = TxClient | typeof prisma

export const PKWT_COMPENSATION_REFERENCE_TYPE = "PkwtCompensationAccrual"
export const PKWT_EXPENSE_CODE = "600028"
export const PKWT_PAYABLE_CODE = "210207"
const FORBIDDEN_CODES = new Set(["600005", "210204"])

export interface PkwtMapping {
  expenseAccountId: number
  payableAccountId: number
}

/** Mapping fail-closed (Putusan 2): kosong/nonaktif/kode terlarang = tolak. */
export async function resolvePkwtMapping(client: Client): Promise<PkwtMapping> {
  const settings = await client.systemSetting.findFirst({
    select: {
      pkwtCompensationExpenseAccountId: true,
      pkwtCompensationPayableAccountId: true,
    },
  })
  const expenseAccountId = settings?.pkwtCompensationExpenseAccountId ?? null
  const payableAccountId = settings?.pkwtCompensationPayableAccountId ?? null
  if (!expenseAccountId || !payableAccountId) {
    throw new Error(PKWT_MSG.mappingMissing())
  }
  for (const [id] of [[expenseAccountId], [payableAccountId]] as const) {
    const account = await client.account.findUnique({
      where: { id },
      select: { code: true, isActive: true, deletedAt: true },
    })
    if (!account || !account.isActive || account.deletedAt) {
      throw new Error(PKWT_MSG.accountInactive(account?.code ?? String(id)))
    }
    if (FORBIDDEN_CODES.has(account.code)) {
      throw new Error(PKWT_MSG.forbiddenAccount(account.code))
    }
  }
  return { expenseAccountId, payableAccountId }
}

export interface CreatePkwtEventInput {
  employeeId: number
  segmentStart: Date
  segmentEnd: Date
  /** Nominal kesepakatan mikro/kecil dari dokumen (Putusan 1 16(6)). */
  agreementAmount?: number | null
  agreementDocumentRef?: string | null
  isLegacy?: boolean
  correctsEventId?: number | null
  createdBy?: number | null
}

/**
 * Bekukan peristiwa kompensasi satu segmen. Basis dibaca dari master saat
 * peristiwa lahir: Employee.baseSalary + Σ EmployeePayrollComponent aktif
 * komponen fixed yang berlaku pada segmentEnd.
 */
export async function createPkwtCompensationEvent(
  client: Client,
  input: CreatePkwtEventInput,
) {
  const employee = await client.employee.findUnique({
    where: { id: input.employeeId },
    select: {
      id: true,
      employmentStatus: true,
      baseSalary: true,
      deletedAt: true,
    },
  })
  if (!employee || employee.deletedAt) {
    throw new Error("Karyawan tidak ditemukan untuk peristiwa kompensasi PKWT.")
  }
  if (employee.employmentStatus !== "PKWT") {
    throw new Error(PKWT_MSG.notPkwt(employee.employmentStatus))
  }
  if (input.segmentEnd.getTime() < input.segmentStart.getTime()) {
    throw new Error("Tanggal akhir segmen PKWT sebelum tanggal mulai segmen.")
  }
  const serviceMonths = computeServiceMonths(input.segmentStart, input.segmentEnd)
  if (serviceMonths < 1) {
    throw new Error(PKWT_MSG.underOneMonth(serviceMonths))
  }

  const assignments = await client.employeePayrollComponent.findMany({
    where: {
      employeeId: input.employeeId,
      isActive: true,
      effectiveFrom: { lte: input.segmentEnd },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: input.segmentEnd } }],
      component: { isActive: true, recurrence: "fixed", kind: "earning" },
    },
    select: { defaultAmount: true },
  })
  const fixedAllowance = assignments.reduce(
    (sum, a) => safeRound(sum + Number(a.defaultAmount), 2),
    0,
  )
  const baseSalary = Number(employee.baseSalary)
  const basisMonthly = safeRound(baseSalary + fixedAllowance, 2)
  if (basisMonthly <= 0) throw new Error(PKWT_MSG.basisZero())

  let amount: number
  if (input.agreementAmount != null) {
    if (!input.agreementDocumentRef?.trim()) {
      throw new Error(PKWT_MSG.agreementRequired())
    }
    if (!(input.agreementAmount > 0)) throw new Error(PKWT_MSG.basisZero())
    amount = safeRound(input.agreementAmount, 2)
  } else {
    amount = computeCompensationAmount(serviceMonths, basisMonthly)
  }

  const overlap = await client.pkwtCompensationEvent.findFirst({
    where: {
      employeeId: input.employeeId,
      status: { in: ["draft", "approved", "paid"] },
      segmentStart: { lte: input.segmentEnd },
      segmentEnd: { gte: input.segmentStart },
    },
    select: { id: true },
  })
  if (overlap) throw new Error(PKWT_MSG.segmentOverlap())

  return client.pkwtCompensationEvent.create({
    data: {
      employeeId: input.employeeId,
      segmentStart: input.segmentStart,
      segmentEnd: input.segmentEnd,
      serviceMonths,
      baseSalarySnapshot: baseSalary,
      fixedAllowanceSnapshot: fixedAllowance,
      basisMonthly,
      amount,
      status: "draft",
      isLegacy: input.isLegacy ?? false,
      agreementDocumentRef: input.agreementDocumentRef?.trim() || null,
      correctsEventId: input.correctsEventId ?? null,
      createdBy: input.createdBy ?? null,
    },
  })
}

export async function approvePkwtCompensationEvent(
  client: Client,
  eventId: number,
  userId: number,
) {
  const event = await client.pkwtCompensationEvent.findUnique({
    where: { id: eventId },
  })
  if (!event) throw new Error("Peristiwa kompensasi PKWT tidak ditemukan.")
  if (event.status !== "draft") {
    throw new Error(
      `Peristiwa kompensasi PKWT berstatus '${event.status}' — hanya draft yang dapat disetujui.`,
    )
  }
  // Peristiwa berharga wajib mapping siap sebelum dibekukan untuk dibayar.
  await resolvePkwtMapping(client)
  return client.pkwtCompensationEvent.update({
    where: { id: eventId },
    data: { status: "approved", approvedBy: userId, approvedAt: new Date() },
  })
}

/**
 * Akrual satu bulan kalender untuk semua karyawan PKWT aktif (Putusan 3).
 * Satu jurnal agregat per bulan; subledger anti-dobel lewat unik
 * (employeeId, segmentStart, period). Bulan terakhir segmen menutup ke
 * nominal peristiwa (bila peristiwa sudah lahir) — selisih sen di sana.
 */
export async function runPkwtMonthlyAccrual(
  client: Client,
  period: string,
  userId?: number | null,
): Promise<{ journalId: number | null; accruedCount: number; totalAmount: number }> {
  const m = /^(\d{4})-(\d{2})$/.exec(period)
  if (!m) throw new Error(`Periode akrual PKWT tidak valid: '${period}' (wajib YYYY-MM).`)
  const year = Number(m[1])
  const month = Number(m[2])
  const monthStartUtc = new Date(Date.UTC(year, month - 1, 1) - 7 * 3600_000)
  const monthEndUtc = new Date(Date.UTC(year, month, 0) - 7 * 3600_000)

  const employees = await client.employee.findMany({
    where: {
      employmentStatus: "PKWT",
      deletedAt: null,
      contractStartDate: { not: null, lte: monthEndUtc },
      OR: [{ contractEndDate: null }, { contractEndDate: { gte: monthStartUtc } }],
    },
    select: { id: true, contractStartDate: true, contractEndDate: true },
    orderBy: { id: "asc" },
  })
  if (employees.length === 0) return { journalId: null, accruedCount: 0, totalAmount: 0 }

  const mapping = await resolvePkwtMapping(client)
  await assertPeriodOpen(monthEndUtc, client as TxClient)

  // Kumpulkan baris subledger bulan ini (lewati yang sudah terakrual).
  type Row = {
    employeeId: number
    eventId: number | null
    segmentStart: Date
    amount: number
    basisMonthly: number
  }
  const rows: Row[] = []
  for (const emp of employees) {
    const segmentStart = emp.contractStartDate!
    const existing = await client.pkwtCompensationAccrual.findFirst({
      where: { employeeId: emp.id, segmentStart, period },
      select: { id: true },
    })
    if (existing) continue
    const event = await client.pkwtCompensationEvent.findFirst({
      where: {
        employeeId: emp.id,
        segmentStart,
        status: { in: ["draft", "approved", "paid"] },
      },
      orderBy: { id: "desc" },
      select: { id: true, amount: true, basisMonthly: true, segmentEnd: true },
    })
    const segmentEnd = event?.segmentEnd ?? emp.contractEndDate ?? monthEndUtc
    // Basis berjalan: dari peristiwa bila sudah lahir, else master bulan ini.
    let basisMonthly = event ? Number(event.basisMonthly) : 0
    if (!event) {
      const empFull = await client.employee.findUnique({
        where: { id: emp.id },
        select: { baseSalary: true },
      })
      const assigns = await client.employeePayrollComponent.findMany({
        where: {
          employeeId: emp.id,
          isActive: true,
          effectiveFrom: { lte: monthEndUtc },
          OR: [{ effectiveTo: null }, { effectiveTo: { gte: monthEndUtc } }],
          component: { isActive: true, recurrence: "fixed", kind: "earning" },
        },
        select: { defaultAmount: true },
      })
      basisMonthly = safeRound(
        Number(empFull?.baseSalary ?? 0) +
          assigns.reduce((s, a) => s + Number(a.defaultAmount), 0),
        2,
      )
    }
    if (basisMonthly <= 0) continue
    const sliceStart = segmentStart.getTime() > monthStartUtc.getTime() ? segmentStart : monthStartUtc
    const sliceEnd = segmentEnd.getTime() < monthEndUtc.getTime() ? segmentEnd : monthEndUtc
    if (sliceEnd.getTime() < sliceStart.getTime()) continue
    const sliceMonths = computeServiceMonths(sliceStart, sliceEnd)
    let amount = safeRound((sliceMonths / 12) * basisMonthly, 2)
    // Bulan terakhir segmen + peristiwa terbekukan: tutup ke nominal persis.
    const isClosing =
      segmentEnd.getTime() <= monthEndUtc.getTime() &&
      segmentEnd.getTime() >= monthStartUtc.getTime()
    if (isClosing && event) {
      const prior = await client.pkwtCompensationAccrual.aggregate({
        where: { employeeId: emp.id, segmentStart },
        _sum: { amount: true },
      })
      amount = safeRound(Number(event.amount) - Number(prior._sum.amount ?? 0), 2)
    }
    if (amount === 0) continue
    rows.push({
      employeeId: emp.id,
      eventId: event?.id ?? null,
      segmentStart,
      amount,
      basisMonthly,
    })
  }
  if (rows.length === 0) return { journalId: null, accruedCount: 0, totalAmount: 0 }

  const totalAmount = safeRound(rows.reduce((s, r) => s + r.amount, 0), 2)
  // Pemanggil action membungkus tx; service juga bisa jalan dari prisma root.
  const asTx = client as TxClient & { $transaction?: typeof prisma.$transaction }
  const run = async (tx: TxClient) => {
    const existingJournal = await tx.journal.findFirst({
      where: { referenceType: PKWT_COMPENSATION_REFERENCE_TYPE, referenceId: year * 100 + month },
      select: { id: true },
    })
    let journalId = existingJournal?.id ?? null
    if (!journalId) {
      const { JournalService } = await import("@/lib/services/journal.service")
      const created = await new JournalService(tx).createJournal({
        journalNumber: `PKWT-ACCR-${period}`,
        transactionDate: monthEndUtc,
        referenceType: PKWT_COMPENSATION_REFERENCE_TYPE,
        referenceId: year * 100 + month,
        description: `Akrual kompensasi PKWT ${period}`,
        type: "GENERAL",
        createdBy: userId ?? undefined,
        entries: [
          { accountId: mapping.expenseAccountId, debit: totalAmount, credit: 0, memo: "Beban Kompensasi PKWT (akrual)" },
          { accountId: mapping.payableAccountId, debit: 0, credit: totalAmount, memo: "Utang Kompensasi PKWT (akrual)" },
        ],
      })
      journalId = created.id
    }
    for (const r of rows) {
      await tx.pkwtCompensationAccrual.create({
        data: {
          employeeId: r.employeeId,
          eventId: r.eventId,
          segmentStart: r.segmentStart,
          period,
          amount: r.amount,
          basisMonthly: r.basisMonthly,
          journalId,
          createdBy: userId ?? null,
        },
      })
    }
    return journalId
  }
  const journalId =
    typeof asTx.$transaction === "function"
      ? await prisma.$transaction((tx) => run(tx as TxClient))
      : await run(client as TxClient)
  return { journalId, accruedCount: rows.length, totalAmount }
}

/**
 * Tarik peristiwa approved ke slip draft sebagai baris khusus (Putusan 5).
 * Mengembalikan data baris untuk dibuat pemanggil dalam tx slip yang sama;
 * nominal parsial DITOLAK. settledViaAccrual dibekukan dari subledger.
 */
export async function buildPkwtPayrollLineData(
  client: Client,
  input: { eventId: number; payrollEmployeeId: number | null; amount?: number | null },
): Promise<{
  componentId: null
  componentNameSnapshot: string
  kindSnapshot: string
  recurrenceSnapshot: string
  isTaxableSnapshot: boolean
  source: string
  assignmentId: null
  pkwtEventId: number
  pkwtSettledViaAccrual: boolean
  accountIdSnapshot: number
  amount: number
}> {
  const event = await client.pkwtCompensationEvent.findUnique({
    where: { id: input.eventId },
  })
  if (!event) throw new Error("Peristiwa kompensasi PKWT tidak ditemukan.")
  if (event.status !== "approved") throw new Error(PKWT_MSG.notApproved())
  if (input.payrollEmployeeId != null && event.employeeId !== input.payrollEmployeeId) {
    throw new Error("Peristiwa kompensasi PKWT milik karyawan lain — tidak boleh ditarik ke slip ini.")
  }
  const amount = input.amount == null ? Number(event.amount) : input.amount
  if (safeRound(amount, 2) !== safeRound(Number(event.amount), 2)) {
    throw new Error(PKWT_MSG.partialForbidden())
  }
  const existingLine = await client.payrollComponentLine.findFirst({
    where: { pkwtEventId: event.id },
    select: { id: true },
  })
  if (existingLine) throw new Error(PKWT_MSG.alreadyPaid())
  const mapping = await resolvePkwtMapping(client)
  const accrued = await client.pkwtCompensationAccrual.aggregate({
    where: { employeeId: event.employeeId, segmentStart: event.segmentStart },
    _sum: { amount: true },
  })
  const settledViaAccrual = Number(accrued._sum.amount ?? 0) > 0
  return {
    componentId: null,
    componentNameSnapshot: "Kompensasi PKWT",
    kindSnapshot: "earning",
    recurrenceSnapshot: "variable",
    isTaxableSnapshot: true,
    source: "pkwt_compensation",
    assignmentId: null,
    pkwtEventId: event.id,
    pkwtSettledViaAccrual: settledViaAccrual,
    accountIdSnapshot: settledViaAccrual ? mapping.payableAccountId : mapping.expenseAccountId,
    amount: safeRound(amount, 2),
  }
}

/** Tandai peristiwa paid sesudah slip terbayar (dipanggil jalur bayar slip). */
export async function markPkwtEventPaid(
  client: Client,
  eventId: number,
  payrollId: number,
) {
  return client.pkwtCompensationEvent.update({
    where: { id: eventId },
    data: { status: "paid", paidPayrollId: payrollId },
  })
}

export { planSegmentAccruals }
