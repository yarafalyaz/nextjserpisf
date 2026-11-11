
import { PrismaClient, Prisma } from '@prisma/client'

import { YEAR_END_CLOSING_REFERENCE_TYPE } from '@/lib/reports/year-end-closing'
import { assertPeriodOpen } from '@/lib/services/period-lock.service'
import { safeAdd, safeSubtract } from '@/lib/utils/math'

interface JournalEntryInput {
  accountId: number
  debit: number
  credit: number
  memo?: string
  costCenterId?: number | null
  profitCenterId?: number | null
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

    // Validate double-entry: total debit must equal total credit exactly (decimal precision 2)
    const totalDebit = input.entries.reduce((sum, e) => safeAdd(sum, e.debit, 2), 0)
    const totalCredit = input.entries.reduce((sum, e) => safeAdd(sum, e.credit, 2), 0)

    const discrepancy = safeSubtract(totalDebit, totalCredit, 2)
    if (discrepancy !== 0) {
      throw new Error(
        `Jurnal tidak balance. Total Debit: ${totalDebit.toFixed(2)}, Total Kredit: ${totalCredit.toFixed(2)}. Selisih: ${Math.abs(discrepancy).toFixed(2)}`
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
        // Validate all account IDs exist AND are postable: jurnal lahir
        // POSTED langsung, jadi titik ini titik pengakuan — akun nonaktif/
        // terhapus/induk ditolak seperti di titik posting lain (pola
        // assertAccountsExist + assertPostableAccount warranty). Tanpa ini
        // jalur stok (mapping settings mentah) memposting ke akun mati.
        const accountIds = [...new Set(input.entries.map((e) => e.accountId))].sort((a, b) => a - b)
        // Penilaian wajib sesudah kunci baris: updateAccount bisa menjadikan
        // akun induk / menonaktifkannya dan deleteCostCenter/deleteProfitCenter
        // bisa menghapus pusat di jendela cek→tulis (JournalEntry.costCenterId
        // bare-int tanpa FK, jadi tak ada P2003 penyelamat). Urutan kunci
        // accounts -> cost_centers -> profit_centers sama dengan postJournal.
        if (typeof tx.$executeRaw === "function" && accountIds.length > 0) {
          await tx.$executeRaw`SELECT id FROM accounts WHERE id IN (${Prisma.join(accountIds)}) FOR UPDATE`
        }
        const accounts = await tx.account.findMany({
          where: { id: { in: accountIds } },
          select: { id: true, isActive: true, deletedAt: true, _count: { select: { children: true } } },
        })

        if (accounts.length !== accountIds.length) {
          const foundIds = accounts.map((a) => a.id)
          const missingIds = accountIds.filter((id) => !foundIds.includes(id))
          throw new Error(`Akun tidak ditemukan: ${missingIds.join(', ')}`)
        }
        const deadIds = accounts
          .filter((a) => a.isActive !== true || a.deletedAt != null)
          .map((a) => a.id)
        if (deadIds.length > 0) {
          throw new Error(`Akun tidak aktif/terhapus atau tidak ditemukan (id: ${deadIds.join(', ')}). Pilih ulang akun sebelum posting.`)
        }
        const parentIds = accounts.filter((a) => a._count.children > 0).map((a) => a.id)
        if (parentIds.length > 0) {
          throw new Error(`Akun induk tidak bisa diposting (id: ${parentIds.join(', ')}). Pilih akun anak yang terposting.`)
        }

        // Pusat dinilai dari baris terkunci (delete pusat mengunci baris yang
        // sama lalu menghitung entri — siapa menang kunci memutuskan: entri
        // POSTED terlihat count, atau pusat hilang dan posting ditolak).
        const costCenterIds = [
          ...new Set(input.entries.map((e) => e.costCenterId).filter((v): v is number => typeof v === 'number' && v > 0)),
        ].sort((a, b) => a - b)
        if (costCenterIds.length > 0) {
          if (typeof tx.$executeRaw === "function") {
            await tx.$executeRaw`SELECT id FROM cost_centers WHERE id IN (${Prisma.join(costCenterIds)}) FOR UPDATE`
          }
          const found = await tx.costCenter.findMany({
            where: { id: { in: costCenterIds }, isActive: true },
            select: { id: true },
          })
          if (found.length !== costCenterIds.length) {
            const missing = costCenterIds.filter((id) => !found.some((f) => f.id === id))
            throw new Error(`Pusat biaya tidak ditemukan atau tidak aktif (id: ${missing.join(', ')}). Pilih ulang pusat biaya sebelum posting.`)
          }
        }
        const profitCenterIds = [
          ...new Set(input.entries.map((e) => e.profitCenterId).filter((v): v is number => typeof v === 'number' && v > 0)),
        ].sort((a, b) => a - b)
        if (profitCenterIds.length > 0) {
          if (typeof tx.$executeRaw === "function") {
            await tx.$executeRaw`SELECT id FROM profit_centers WHERE id IN (${Prisma.join(profitCenterIds)}) FOR UPDATE`
          }
          const found = await tx.profitCenter.findMany({
            where: { id: { in: profitCenterIds } },
            select: { id: true },
          })
          if (found.length !== profitCenterIds.length) {
            const missing = profitCenterIds.filter((id) => !found.some((f) => f.id === id))
            throw new Error(`Pusat laba tidak ditemukan (id: ${missing.join(', ')}). Pilih ulang pusat laba sebelum posting.`)
          }
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
            profitCenterId: entry.profitCenterId ?? null,
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

        // Create reversal entries (swap debit/credit). Putaran 50:
        // profitCenterId ikut disalin (pola accounting.hook:355) — tanpa
        // itu laporan pusat laba tak netral sesudah reversal: asal tetap
        // terbebani, lawan jatuh ke "Tanpa Pusat Laba".
        const reversalEntries: JournalEntryInput[] = original.entries.map((e) => ({
          accountId: e.accountId,
          debit: Number(e.credit),
          credit: Number(e.debit),
          memo: `Reversal: ${e.memo ?? ''}`.trim(),
          costCenterId: e.costCenterId ?? null,
          profitCenterId: e.profitCenterId ?? null,
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
            profitCenterId: entry.profitCenterId ?? null,
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

