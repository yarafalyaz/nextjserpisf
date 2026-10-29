
import { PrismaClient, Prisma } from '@prisma/client'

import { YEAR_END_CLOSING_REFERENCE_TYPE } from '@/lib/reports/year-end-closing'
import { assertPeriodOpen } from '@/lib/services/period-lock.service'

interface JournalEntryInput {
  accountId: number
  debit: number
  credit: number
  memo?: string
  costCenterId?: number | null
}

interface CreateJournalInput {
  journalNumber: string
  transactionDate: Date
  referenceType?: string
  referenceId?: number
  description?: string
  type: string
  createdBy?: number
  entries: JournalEntryInput[]
}

type PrismaLike = PrismaClient | Prisma.TransactionClient

/**
 * Jurnal penutup tahun (F-2026-10-23-121-V Putusan 3) HANYA boleh di-reversal
 * lewat `reverseYearEndClosing` (gerbang manage_settings + assertApproved di
 * lapisan action/service itu). Jalur generik di bawah tidak menyalin
 * profitCenterId, jadi me-reversal jurnal penutup dari sini akan merusak
 * jejak pusat laba — ditolak berisik, tanpa pengecualian.
 */
export const YEAR_END_CLOSING_GENERIC_REVERSAL_ERROR =
  "Jurnal penutup tahun hanya boleh di-reversal lewat reversal penutup tahun (izin manage_settings), bukan reversal jurnal umum."

/**
 * TASK-025: jurnal lawan reversal (`referenceType: "Journal"`, POSTED) tidak
 * boleh di-reverse lagi lewat jalur generik. Membaliknya memulihkan jurnal
 * asal secara diam-diam: agregasi GL POSTED+REVERSED tetap benar, tetapi
 * loader terfilter `referenceType` (mis. return-credit) kehilangan jurnal
 * pemulih karena ber-referenceType "Journal" dan menyimpang diam-diam.
 * Koreksi yang sah: posting ulang dokumen sumber atau jurnal koreksi manual.
 */
export const REVERSAL_JOURNAL_REVERSAL_ERROR =
  "Jurnal reversal tidak boleh di-reverse lagi: jurnal ini adalah jurnal lawan (referenceType Journal). Posting ulang dokumen sumber atau buat jurnal koreksi manual sebagai gantinya."

export class JournalService {
  constructor(private prisma: PrismaLike) {}

  /**
   * Create a journal with double-entry validation.
   * Ensures total debits equal total credits before persisting.
   * Uses Serializable isolation for data integrity.
   */
  async createJournal(input: CreateJournalInput): Promise<{ id: number; journalNumber: string }> {
    // Validate entries exist
    if (!input.entries || input.entries.length === 0) {
      throw new Error('Jurnal harus memiliki minimal 1 entri.')
    }

    // Validate double-entry: total debit must equal total credit
    const totalDebit = input.entries.reduce((sum, e) => sum + e.debit, 0)
    const totalCredit = input.entries.reduce((sum, e) => sum + e.credit, 0)

    // Use epsilon comparison for floating point
    if (Math.abs(totalDebit - totalCredit) > 0.001) {
      throw new Error(
        `Jurnal tidak balance. Total Debit: ${totalDebit.toFixed(2)}, Total Kredit: ${totalCredit.toFixed(2)}. Selisih: ${Math.abs(totalDebit - totalCredit).toFixed(2)}`
      )
    }

    // Validate each entry has either debit or credit (not both, not zero)
    for (const entry of input.entries) {
      if (entry.debit < 0 || entry.credit < 0) {
        throw new Error('Debit dan Kredit tidak boleh negatif.')
      }
      if (entry.debit === 0 && entry.credit === 0) {
        throw new Error('Setiap entri harus memiliki nilai Debit atau Kredit.')
      }
      if (entry.debit > 0 && entry.credit > 0) {
        throw new Error('Entri tidak boleh memiliki Debit dan Kredit sekaligus.')
      }
    }

    const persist = async (tx: Prisma.TransactionClient) => {
        await assertPeriodOpen(input.transactionDate, tx)
        // Validate all account IDs exist
        const accountIds = [...new Set(input.entries.map((e) => e.accountId))]
        const accounts = await tx.account.findMany({
          where: { id: { in: accountIds } },
          select: { id: true },
        })

        if (accounts.length !== accountIds.length) {
          const foundIds = accounts.map((a) => a.id)
          const missingIds = accountIds.filter((id) => !foundIds.includes(id))
          throw new Error(`Akun tidak ditemukan: ${missingIds.join(', ')}`)
        }

        // Create journal header
        const journal = await tx.journal.create({
          data: {
            journalNumber: input.journalNumber,
            transactionDate: input.transactionDate,
            referenceType: input.referenceType ?? null,
            referenceId: input.referenceId ?? null,
            description: input.description ?? null,
            type: input.type,
            status: 'POSTED',
            totalDebit,
            totalCredit,
            createdBy: input.createdBy ?? null,
          },
        })

        // Create journal entries
        await tx.journalEntry.createMany({
          data: input.entries.map((entry) => ({
            journalId: journal.id,
            accountId: entry.accountId,
            debit: entry.debit,
            credit: entry.credit,
            memo: entry.memo ?? null,
            costCenterId: entry.costCenterId ?? null,
          })),
        })

        return { id: journal.id, journalNumber: journal.journalNumber }
    }

    // Stock hooks pass their outer transaction client here. Starting another
    // Prisma transaction from that client is unsupported and would either fail
    // at runtime or detach the journal from the stock update's atomic commit.
    const rootClient = this.prisma as PrismaClient
    if (typeof rootClient.$transaction !== "function") {
      return persist(this.prisma as Prisma.TransactionClient)
    }
    return rootClient.$transaction(persist, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    })
  }

  /**
   * Void/reverse a posted journal by creating a reversal journal
   * with debits and credits swapped.
   */
  async reverseJournal(
    journalId: number,
    reversalNumber: string,
    userId?: number
  ): Promise<{ id: number; journalNumber: string }> {
    return await this.prisma.$transaction(
      async (tx) => {
        const original = await tx.journal.findUniqueOrThrow({
          where: { id: journalId },
          include: { entries: true },
        })

        if (original.status === 'REVERSED') {
          throw new Error(`Jurnal ${original.journalNumber} sudah di-reverse.`)
        }

        // Selaras finance.actions reverseJournal: hanya POSTED yang boleh
        // dibalik. DRAFT/REVERSING/dll ditolak berisik — sebelumnya lolos
        // dan dibuatkan jurnal lawan, menyimpang dari pemeriksaan
        // existing-reversal (POSTED yang sudah punya lawan pun bisa
        // dibuatkan lawan kedua secara senyap).
        if (original.status !== 'POSTED') {
          throw new Error(
            `Jurnal ${original.journalNumber} tidak bisa dibalik (status: ${original.status})`,
          )
        }

        if (original.referenceType === 'Journal') {
          throw new Error(REVERSAL_JOURNAL_REVERSAL_ERROR)
        }

        if (original.referenceType === YEAR_END_CLOSING_REFERENCE_TYPE) {
          throw new Error(YEAR_END_CLOSING_GENERIC_REVERSAL_ERROR)
        }

        await assertPeriodOpen(original.transactionDate, tx)

        // Pemeriksaan existing-reversal (selaras reverseJournalsByReferenceTx):
        // POSTED yang sudah punya jurnal lawan tidak boleh dibuatkan kedua.
        const existingReversal = await tx.journal.findFirst({
          where: { referenceType: 'Journal', referenceId: journalId },
          select: { id: true },
        })
        if (existingReversal) {
          throw new Error(`Jurnal ${original.journalNumber} sudah di-reverse.`)
        }

        // Create reversal entries (swap debit/credit)
        const reversalEntries: JournalEntryInput[] = original.entries.map((e) => ({
          accountId: e.accountId,
          debit: Number(e.credit),
          credit: Number(e.debit),
          memo: `Reversal: ${e.memo ?? ''}`.trim(),
          costCenterId: e.costCenterId ?? null,
        }))

        // Create reversal journal. Date it to the ORIGINAL's transactionDate so
        // the (REVERSED original + POSTED reversal) pair stays inside the same
        // period — otherwise a period report would include the reversed original
        // with no offset and the reversal would land in the current period.
        const reversal = await tx.journal.create({
          data: {
            journalNumber: reversalNumber,
            transactionDate: original.transactionDate,
            referenceType: 'Journal',
            referenceId: original.id,
            description: `Reversal of ${original.journalNumber}`,
            type: original.type,
            status: 'POSTED',
            totalDebit: Number(original.totalCredit),
            totalCredit: Number(original.totalDebit),
            createdBy: userId ?? null,
          },
        })

        await tx.journalEntry.createMany({
          data: reversalEntries.map((entry) => ({
            journalId: reversal.id,
            accountId: entry.accountId,
            debit: entry.debit,
            credit: entry.credit,
            memo: entry.memo ?? null,
            costCenterId: entry.costCenterId ?? null,
          })),
        })

        // Mark original as reversed
        await tx.journal.update({
          where: { id: journalId },
          data: { status: 'REVERSED' },
        })

        return { id: reversal.id, journalNumber: reversal.journalNumber }
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      }
    )
  }
}

