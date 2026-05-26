
import { PrismaClient, Prisma } from '@prisma/client'
import { prisma } from '@/lib/db/prisma'

interface JournalEntryInput {
  accountId: number
  debit: number
  credit: number
  memo?: string
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

export class JournalService {
  constructor(private prisma: PrismaClient) {}

  /**
   * Create a journal with double-entry validation.
   * Ensures total debits equal total credits before persisting.
   * Uses Serializable isolation for data integrity.
   */
  async createJournal(input: CreateJournalInput): Promise<{ id: number; journalNumber: string }> {
    // Validate entries exist
    if (!input.entries || input.entries.length === 0) {
      throw new Error('Journal harus memiliki minimal 1 entry.')
    }

    // Validate double-entry: total debit must equal total credit
    const totalDebit = input.entries.reduce((sum, e) => sum + e.debit, 0)
    const totalCredit = input.entries.reduce((sum, e) => sum + e.credit, 0)

    // Use epsilon comparison for floating point
    if (Math.abs(totalDebit - totalCredit) > 0.001) {
      throw new Error(
        `Journal tidak balance. Total Debit: ${totalDebit.toFixed(2)}, Total Credit: ${totalCredit.toFixed(2)}. Selisih: ${Math.abs(totalDebit - totalCredit).toFixed(2)}`
      )
    }

    // Validate each entry has either debit or credit (not both, not zero)
    for (const entry of input.entries) {
      if (entry.debit < 0 || entry.credit < 0) {
        throw new Error('Debit dan Credit tidak boleh negatif.')
      }
      if (entry.debit === 0 && entry.credit === 0) {
        throw new Error('Setiap entry harus memiliki nilai Debit atau Credit.')
      }
      if (entry.debit > 0 && entry.credit > 0) {
        throw new Error('Entry tidak boleh memiliki Debit dan Credit sekaligus.')
      }
    }

    return await this.prisma.$transaction(
      async (tx) => {
        // Validate all account IDs exist
        const accountIds = [...new Set(input.entries.map((e) => e.accountId))]
        const accounts = await tx.account.findMany({
          where: { id: { in: accountIds } },
          select: { id: true },
        })

        if (accounts.length !== accountIds.length) {
          const foundIds = accounts.map((a) => a.id)
          const missingIds = accountIds.filter((id) => !foundIds.includes(id))
          throw new Error(`Account tidak ditemukan: ${missingIds.join(', ')}`)
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
          })),
        })

        return { id: journal.id, journalNumber: journal.journalNumber }
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      }
    )
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
          throw new Error(`Journal ${original.journalNumber} sudah di-reverse.`)
        }

        // Create reversal entries (swap debit/credit)
        const reversalEntries: JournalEntryInput[] = original.entries.map((e) => ({
          accountId: e.accountId,
          debit: Number(e.credit),
          credit: Number(e.debit),
          memo: `Reversal: ${e.memo ?? ''}`.trim(),
        }))

        // Create reversal journal
        const reversal = await tx.journal.create({
          data: {
            journalNumber: reversalNumber,
            transactionDate: new Date(),
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

// Singleton instance
export const journalService = new JournalService(prisma)
