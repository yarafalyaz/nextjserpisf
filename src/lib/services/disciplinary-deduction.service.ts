/**
 * Fisik tahap 2 BR-DISC-09 (F-2026-10-25-020-V Putusan 3/5/6).
 *
 * - Dokumen keputusan manusia = satu-satunya pemicu potongan. Service ini
 *   TIDAK membaca rekod SP untuk memicu apa pun; disciplinaryRecordId di
 *   keputusan hanya tautan konteks.
 * - Jurnal potongan per periode payroll: Dr Hutang Gaji (210204 via
 *   setting existing salariesPayableAccountId) / Cr 710006 (denda) atau
 *   Cr akun kompensasi snapshot keputusan (ganti rugi). Akun kandidat
 *   210210/210211/710006 dari setting fail-closed (kode wajib cocok).
 * - Idempotency per (keputusan, periode, jenis): baris
 *   DisciplinaryDeductionApplication unik; replay = hasil awal, nol
 *   jurnal baru (QA-DISC09-5).
 * - Jurnal terposting beku; koreksi = reversal periode terbuka (di luar
 *   service ini, pola jurnal existing).
 */

import { prisma, type TxClient } from "@/lib/db/prisma"
import { assertPeriodOpen } from "@/lib/services/period-lock.service"
import { JournalService } from "@/lib/services/journal.service"
import {
  disciplinaryDeductionForPeriod,
  disciplinaryDeductionIdempotencyKey,
  evaluateDisciplinaryDeductionDecision,
  evaluateSuspensionSnapshot,
  type DisciplinaryDeductionKind,
} from "@/lib/reports/disciplinary-deduction"
import { nextSlug } from "@/lib/utils/slug-db"

type Client = TxClient | typeof prisma

export const DISC09_REFERENCE_TYPE = "DisciplinaryDeduction"
export const DISC09_PPH21_CODE = "210210"
export const DISC09_BPJS_CODE = "210211"
export const DISC09_FINE_INCOME_CODE = "710006"
const SALARIES_PAYABLE_CODE = "210204"

async function resolveAccountBySetting(
  client: Client,
  accountId: number | null | undefined,
  expectedCode: string,
  label: string,
): Promise<number> {
  if (!accountId) {
    throw new Error(`Mapping akun ${label} belum dikonfigurasi — isi di Pengaturan > Mapping Akun sebelum potongan disiplin diposting (fail-closed).`)
  }
  const account = await client.account.findUnique({
    where: { id: accountId },
    select: { code: true, isActive: true, deletedAt: true },
  })
  if (!account || !account.isActive || account.deletedAt) {
    throw new Error(`Akun ${label} tidak aktif atau tidak ditemukan — potongan disiplin ditolak (fail-closed).`)
  }
  if (account.code !== expectedCode) {
    throw new Error(`Akun ${label} harus berkode ${expectedCode}, terpetakan '${account.code}' — potongan disiplin ditolak.`)
  }
  return accountId
}

/** Mapping statutori Putusan 5, fail-closed per akun yang diminta. */
export async function resolveDisc09StatutoryMapping(
  client: Client,
  need: { pph21?: boolean; bpjs?: boolean; fineIncome?: boolean },
): Promise<{ pph21PayableAccountId?: number; bpjsEmployeePayableAccountId?: number; fineIncomeAccountId?: number }> {
  const settings = await client.systemSetting.findFirst({
    select: {
      pph21PayableAccountId: true,
      bpjsEmployeePayableAccountId: true,
      disciplinaryFineIncomeAccountId: true,
    },
  })
  const out: { pph21PayableAccountId?: number; bpjsEmployeePayableAccountId?: number; fineIncomeAccountId?: number } = {}
  if (need.pph21) out.pph21PayableAccountId = await resolveAccountBySetting(client, settings?.pph21PayableAccountId, DISC09_PPH21_CODE, "Utang PPh 21 Karyawan")
  if (need.bpjs) out.bpjsEmployeePayableAccountId = await resolveAccountBySetting(client, settings?.bpjsEmployeePayableAccountId, DISC09_BPJS_CODE, "Utang Iuran BPJS Karyawan")
  if (need.fineIncome) out.fineIncomeAccountId = await resolveAccountBySetting(client, settings?.disciplinaryFineIncomeAccountId, DISC09_FINE_INCOME_CODE, "Pendapatan Denda Karyawan")
  return out
}

export interface ApplyDisciplinaryDeductionInput {
  decisionId: number
  payrollId?: number | null
  /** Periode payroll "YYYY-MM" — bagian kunci idempotensi. */
  period: string
  /** Upah pembayaran periode ini (dasar plafon 50%). */
  periodPay: number
  transactionDate: Date
  createdBy?: number | null
}

export interface ApplyDisciplinaryDeductionResult {
  applicationId: number
  journalId: number | null
  amount: number
  replayed: boolean
}

/**
 * Terapkan SATU keputusan potongan ke satu periode. Wajib dipanggil di
 * dalam transaksi pemanggil bila pemanggil punya tx; tanpa tx service
 * membuka transaksi sendiri.
 */
export async function applyDisciplinaryDeduction(
  client: Client,
  input: ApplyDisciplinaryDeductionInput,
): Promise<ApplyDisciplinaryDeductionResult> {
  const decision = await client.disciplinaryDeductionDecision.findUnique({
    where: { id: input.decisionId },
  })
  if (!decision || decision.deletedAt) {
    throw new Error("Dokumen keputusan potongan disiplin tidak ditemukan.")
  }
  const kind = decision.kind as DisciplinaryDeductionKind
  const guard = evaluateDisciplinaryDeductionDecision({
    id: decision.id,
    documentNo: decision.documentNo,
    decidedAt: decision.decidedAt,
    signedByEmployeeId: decision.signedBy,
    kind,
    amount: Number(decision.amount),
  })
  if (!guard.allowed) throw new Error(guard.message)

  const key = disciplinaryDeductionIdempotencyKey({ decisionId: decision.id, period: input.period, kind })
  const existing = await client.disciplinaryDeductionApplication.findUnique({
    where: { idempotencyKey: key },
    select: { id: true, journalId: true, amount: true },
  })
  if (existing) {
    return { applicationId: existing.id, journalId: existing.journalId, amount: Number(existing.amount), replayed: true }
  }

  const applied = await client.disciplinaryDeductionApplication.aggregate({
    where: { decision: { employeeId: decision.employeeId }, period: input.period },
    _sum: { amount: true },
  })
  const { amount, guard: capGuard } = disciplinaryDeductionForPeriod({
    decision: {
      id: decision.id,
      documentNo: decision.documentNo,
      decidedAt: decision.decidedAt,
      signedByEmployeeId: decision.signedBy,
      kind,
      amount: Number(decision.amount),
    },
    periodPay: input.periodPay,
    alreadyApplied: Number(applied._sum.amount ?? 0),
  })
  if (!capGuard.allowed) throw new Error(capGuard.message)
  if (amount <= 0) throw new Error("Nominal potongan disiplin periode ini nol — tidak ada jurnal dibuat.")

  // Akun kredit: denda -> 710006 (setting); ganti rugi -> snapshot keputusan.
  let creditAccountId: number
  if (kind === "denda") {
    const mapping = await resolveDisc09StatutoryMapping(client, { fineIncome: true })
    creditAccountId = mapping.fineIncomeAccountId!
  } else {
    if (!decision.compensationAccountId) {
      throw new Error("Keputusan ganti rugi wajib menyebut akun kompensasi terkait dokumennya (bukan 710006).")
    }
    const account = await client.account.findUnique({
      where: { id: decision.compensationAccountId },
      select: { code: true, isActive: true, deletedAt: true },
    })
    if (!account || !account.isActive || account.deletedAt) {
      throw new Error("Akun kompensasi pada dokumen keputusan tidak aktif — potongan ditolak (fail-closed).")
    }
    if (account.code === DISC09_FINE_INCOME_CODE) {
      throw new Error("Ganti rugi tidak boleh dikredit ke 710006 Pendapatan Denda Karyawan.")
    }
    creditAccountId = decision.compensationAccountId
  }

  const settings = await client.systemSetting.findFirst({ select: { salariesPayableAccountId: true } })
  const debitAccountId = await resolveAccountBySetting(client, settings?.salariesPayableAccountId, SALARIES_PAYABLE_CODE, "Hutang Gaji")

  await assertPeriodOpen(input.transactionDate, client as TxClient)

  const run = async (tx: TxClient): Promise<ApplyDisciplinaryDeductionResult> => {
    // Cek ulang di dalam tx: balapan dua proses -> unik DB + cek ini.
    const inTx = await tx.disciplinaryDeductionApplication.findUnique({
      where: { idempotencyKey: key },
      select: { id: true, journalId: true, amount: true },
    })
    if (inTx) return { applicationId: inTx.id, journalId: inTx.journalId, amount: Number(inTx.amount), replayed: true }

    const journal = await new JournalService(tx).createJournal({
      journalNumber: `DISC09-${decision.id}-${input.period}-${kind}`,
      transactionDate: input.transactionDate,
      referenceType: DISC09_REFERENCE_TYPE,
      referenceId: decision.id,
      description: `Potongan ${kind === "denda" ? "denda" : "ganti rugi"} disiplin ${decision.documentNo} periode ${input.period}`,
      type: "GENERAL",
      createdBy: input.createdBy ?? undefined,
      entries: [
        { accountId: debitAccountId, debit: amount, credit: 0, memo: "Potongan disiplin dari hutang gaji" },
        { accountId: creditAccountId, debit: 0, credit: amount, memo: kind === "denda" ? "Pendapatan Denda Karyawan" : "Ganti rugi disiplin" },
      ],
    })
    const application = await tx.disciplinaryDeductionApplication.create({
      data: {
        decisionId: decision.id,
        payrollId: input.payrollId ?? null,
        period: input.period,
        kind,
        amount,
        idempotencyKey: key,
        journalId: journal.id,
        createdBy: input.createdBy ?? null,
      },
    })
    return { applicationId: application.id, journalId: journal.id, amount, replayed: false }
  }

  const asTx = client as TxClient & { $transaction?: typeof prisma.$transaction }
  if (typeof asTx.$transaction === "function") {
    return prisma.$transaction((tx) => run(tx as TxClient))
  }
  return run(client as TxClient)
}

export interface CreateDisciplinaryDecisionInput {
  documentNo: string
  decidedAt: Date
  employeeId: number
  disciplinaryRecordId?: number | null
  kind: DisciplinaryDeductionKind
  amount: number
  compensationAccountId?: number | null
  suspensionKind?: string | null
  suspensionPayTreatment?: string | null
  regulationReference?: string | null
  signedBy: number
  createdBy?: number | null
}

/**
 * Catat dokumen keputusan manusia (jalur tulis satu-satunya). Snapshot
 * disimpan verbatim; tidak ada turunan dari rekod SP di sini.
 */
export async function createDisciplinaryDeductionDecision(
  client: Client,
  input: CreateDisciplinaryDecisionInput,
) {
  const guard = evaluateDisciplinaryDeductionDecision({
    id: 0,
    documentNo: input.documentNo,
    decidedAt: input.decidedAt,
    signedByEmployeeId: input.signedBy,
    kind: input.kind,
    amount: input.amount,
  })
  if (!guard.allowed) throw new Error(guard.message)
  const suspensionGuard = evaluateSuspensionSnapshot({
    suspensionKind: input.suspensionKind ?? null,
    payTreatment: input.suspensionPayTreatment ?? null,
    regulationReference: input.regulationReference ?? null,
  })
  if (!suspensionGuard.allowed) throw new Error(suspensionGuard.message)
  if (input.kind === "ganti_rugi" && !input.compensationAccountId) {
    throw new Error("Keputusan ganti rugi wajib menyebut akun kompensasi terkait dokumennya (bukan 710006).")
  }

  const employee = await client.employee.findUnique({
    where: { id: input.employeeId },
    select: { id: true, deletedAt: true },
  })
  if (!employee || employee.deletedAt) throw new Error("Karyawan pada dokumen keputusan tidak ditemukan.")

  const slug = await nextSlug("disciplinaryDeductionDecision", input.documentNo)
  return client.disciplinaryDeductionDecision.create({
    data: {
      slug,
      documentNo: input.documentNo.trim(),
      decidedAt: input.decidedAt,
      employeeId: input.employeeId,
      disciplinaryRecordId: input.disciplinaryRecordId ?? null,
      kind: input.kind,
      amount: input.amount,
      compensationAccountId: input.compensationAccountId ?? null,
      suspensionKind: input.suspensionKind ?? null,
      suspensionPayTreatment: input.suspensionPayTreatment ?? null,
      regulationReference: input.regulationReference?.trim() || null,
      signedBy: input.signedBy,
      createdBy: input.createdBy ?? null,
    },
  })
}
