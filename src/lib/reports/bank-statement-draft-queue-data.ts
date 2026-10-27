/**
 * Loader baca-saja antrean rekening koran draft mengendap
 * (F-2026-10-27-096-S, 096-B+F).
 *
 * Fail-closed SEBELUM query (BR-BSQ-06): gerbang `view_bank_statements`
 * — key yang sama dengan halaman daftar existing, tanpa key baru —
 * ditegakkan di sini sebelum query apa pun.
 *
 * Anti-N+1 (BR-BSQ-10): satu query BankStatement draft, SATU query
 * massal BankStatementLine untuk semua koran populasi, SATU query
 * massal BankReconciliationItem matched untuk semua baris, SATU query
 * massal Account, dan SATU query massal User pembuat. Tidak ada query
 * per koran/per baris. Definisi ganda tercocokkan (BR-BSQ-02) dan
 * dedup per baris diterapkan builder murni.
 *
 * Select daftar-putih (BR-BSQ-07): `filePath` dan `notes` tidak pernah
 * dibaca ke payload antrean; `updatedAt` tidak dibaca (umur hanya
 * dari `createdAt`, BR-BSQ-04). Nominal header verbatim tersimpan,
 * Decimal→Number di tepi sini; tidak dihitung ulang dari baris dan
 * tidak membaca jurnal (BR-BSQ-05).
 *
 * Baca-saja mutlak (BR-BSQ-08): hanya findMany; tidak memanggil aksi
 * buat/ubah/hapus baris, pencocokan, penyelesaian rekonsiliasi, dan
 * tidak menulis kolom apa pun.
 */

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import {
  buildBankStatementDraftQueue,
  type BankStatementDraftInput,
  type BankStatementDraftLineInput,
  type BankStatementDraftQueue,
} from "@/lib/reports/bank-statement-draft-queue"

export interface BankStatementDraftQueueOptions {
  now?: Date
  limit?: number
}

export async function getBankStatementDraftQueue(
  options: BankStatementDraftQueueOptions = {},
): Promise<BankStatementDraftQueue> {
  await requirePermission("view_bank_statements")

  const statements = await prisma.bankStatement.findMany({
    where: { status: "draft", deletedAt: null },
    select: {
      id: true,
      slug: true,
      status: true,
      deletedAt: true,
      accountId: true,
      accountNumber: true,
      date: true,
      reference: true,
      periodStart: true,
      periodEnd: true,
      openingBalance: true,
      closingBalance: true,
      totalDebits: true,
      totalCredits: true,
      uploadedBy: true,
      createdAt: true,
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  })

  const statementIds = statements.map((s) => s.id)
  const lines =
    statementIds.length > 0
      ? await prisma.bankStatementLine.findMany({
          where: { bankStatementId: { in: statementIds } },
          select: { id: true, bankStatementId: true, status: true },
        })
      : []

  const lineIds = lines.map((l) => l.id)
  const matchedItems =
    lineIds.length > 0
      ? await prisma.bankReconciliationItem.findMany({
          where: { bankStatementLineId: { in: lineIds }, matched: true },
          select: { bankStatementLineId: true },
        })
      : []
  const matchedLineIds = new Set(
    matchedItems
      .map((item) => item.bankStatementLineId)
      .filter((id): id is number => id !== null),
  )

  const linesByStatement = new Map<number, BankStatementDraftLineInput[]>()
  for (const line of lines) {
    const arr = linesByStatement.get(line.bankStatementId) ?? []
    arr.push({
      lineId: line.id,
      status: line.status,
      hasMatchedReconciliationItem: matchedLineIds.has(line.id),
    })
    linesByStatement.set(line.bankStatementId, arr)
  }

  const accountIds = [...new Set(statements.map((s) => s.accountId))]
  const accounts =
    accountIds.length > 0
      ? await prisma.account.findMany({
          where: { id: { in: accountIds } },
          select: { id: true, code: true, name: true },
        })
      : []
  const accountById = new Map(accounts.map((a) => [a.id, a]))

  const uploaderIds = [
    ...new Set(
      statements
        .map((s) => s.uploadedBy)
        .filter((id): id is number => id !== null),
    ),
  ]
  const uploaders =
    uploaderIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: uploaderIds } },
          select: { id: true, name: true },
        })
      : []
  const uploaderNameById = new Map(uploaders.map((u) => [u.id, u.name]))

  const inputs: BankStatementDraftInput[] = statements.map((s) => {
    const account = accountById.get(s.accountId)
    return {
      statementId: s.id,
      slug: s.slug,
      status: s.status,
      deletedAt: s.deletedAt,
      accountId: s.accountId,
      accountCode: account?.code ?? null,
      accountName: account?.name ?? null,
      accountNumber: s.accountNumber,
      date: s.date,
      reference: s.reference,
      periodStart: s.periodStart,
      periodEnd: s.periodEnd,
      openingBalance: Number(s.openingBalance),
      closingBalance: Number(s.closingBalance),
      totalDebits: Number(s.totalDebits),
      totalCredits: Number(s.totalCredits),
      createdAt: s.createdAt,
      uploadedBy: s.uploadedBy,
      uploadedByName:
        s.uploadedBy !== null ? (uploaderNameById.get(s.uploadedBy) ?? null) : null,
      lines: linesByStatement.get(s.id) ?? [],
    }
  })

  return buildBankStatementDraftQueue(inputs, options.now ?? new Date(), options.limit)
}
