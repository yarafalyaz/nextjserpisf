import { prisma } from "@/lib/db/prisma"
import { generateDocumentNumber } from "@/lib/utils/document-number"
import { nextSlug } from "@/lib/utils/slug-db"
import { safeAdd } from "@/lib/utils/math"
import { isRecurrenceFrequency, isWithinSchedule, nextRunAfter, type RecurrenceFrequency } from "@/lib/reports/recurring-schedule"

export interface RecurringTemplate {
  accountId?: number | null
  paidFromAccountId?: number | null
  categoryId?: number | null
  vendorId?: number | null
  amount?: number
  description?: string
  lines?: { accountId: number; debit: number; credit: number; memo?: string }[]
}

export type RecurringType = "journal" | "expense"

export function parseRecurringTemplate(raw: string | null): RecurringTemplate {
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === "object" ? (parsed as RecurringTemplate) : {}
  } catch {
    return {}
  }
}

/**
 * Validates a template without touching the database — the caller surfaces the
 * message to the user, and the scheduler skips (never half-creates) bad rows.
 */
export function validateRecurringTemplate(type: string, template: RecurringTemplate): string | null {
  if (type === "journal") {
    const lines = template.lines?.filter((line) => line.accountId && (line.debit > 0 || line.credit > 0)) ?? []
    if (lines.length < 2) return "Jurnal berulang butuh minimal 2 baris (debit & kredit)"
    const totalDebit = lines.reduce((sum, line) => safeAdd(sum, line.debit, 2), 0)
    const totalCredit = lines.reduce((sum, line) => safeAdd(sum, line.credit, 2), 0)
    if (Math.abs(totalDebit - totalCredit) >= 0.005) {
      return `Jurnal berulang tidak balance: debit ${totalDebit} ≠ kredit ${totalCredit}`
    }
    return null
  }

  if (type === "expense") {
    if (!template.accountId) return "Akun beban wajib dipilih"
    if (!template.amount || template.amount <= 0) return "Nominal beban harus lebih dari 0"
    return null
  }

  return `Jenis transaksi berulang "${type}" tidak dikenal`
}

/** Creates the scheduled document as a DRAFT and returns a human summary. */
async function generateDocument(
  type: string,
  template: RecurringTemplate,
  date: Date,
  userId: number | null,
): Promise<string> {
  if (type === "journal") {
    const lines = (template.lines ?? []).filter((line) => line.accountId && (line.debit > 0 || line.credit > 0))
    const totalDebit = lines.reduce((sum, line) => safeAdd(sum, line.debit, 2), 0)
    const totalCredit = lines.reduce((sum, line) => safeAdd(sum, line.credit, 2), 0)
    const journalNumber = await generateDocumentNumber("JRN")

    const journal = await prisma.journal.create({
      data: {
        journalNumber,
        slug: await nextSlug("journal", journalNumber),
        transactionDate: date,
        description: template.description ?? "Transaksi berulang",
        type: "GENERAL",
        status: "DRAFT",
        totalDebit,
        totalCredit,
        createdBy: userId,
        entries: {
          create: lines.map((line) => ({
            accountId: line.accountId,
            debit: line.debit || 0,
            credit: line.credit || 0,
            memo: line.memo ?? template.description ?? null,
          })),
        },
      },
    })
    return `Jurnal ${journal.journalNumber}`
  }

  if (type === "expense") {
    const documentNo = await generateDocumentNumber("EXP")
    await prisma.expense.create({
      data: {
        documentNo,
        slug: await nextSlug("expense", documentNo),
        accountId: template.accountId!,
        paidFromAccountId: template.paidFromAccountId ?? null,
        categoryId: template.categoryId ?? null,
        vendorId: template.vendorId ?? null,
        amount: template.amount!,
        date,
        description: template.description ?? "Beban berulang",
        status: "draft",
        createdBy: userId,
      },
    })
    return `Beban ${documentNo}`
  }

  throw new Error(`Jenis transaksi berulang "${type}" tidak dikenal`)
}

/**
 * Runs every due template, creating DRAFT documents so a human still reviews
 * before anything hits stock or the general ledger. A failing template is
 * recorded and skipped rather than aborting the whole batch.
 */
export async function runDueRecurring(
  asOf: Date = new Date(),
  userId: number | null = null,
): Promise<{ processed: number; generated: string[]; errors: string[] }> {
  const due = await prisma.recurringTransaction.findMany({
    where: { isActive: true, deletedAt: null, nextRunDate: { lte: asOf } },
    orderBy: { nextRunDate: "asc" },
  })

  const generated: string[] = []
  const errors: string[] = []

  for (const schedule of due) {
    if (!isWithinSchedule(schedule.nextRunDate, schedule.startDate, schedule.endDate)) {
      // Past its end date → retire it instead of generating more documents.
      await prisma.recurringTransaction.update({
        where: { id: schedule.id },
        data: { isActive: false, lastResult: "Berakhir (melewati tanggal akhir)" },
      })
      continue
    }

    const template = parseRecurringTemplate(schedule.template)
    const invalid = validateRecurringTemplate(schedule.type, template)
    if (invalid) {
      errors.push(`${schedule.name}: ${invalid}`)
      await prisma.recurringTransaction.update({
        where: { id: schedule.id },
        data: { lastResult: `Gagal: ${invalid}` },
      })
      continue
    }

    try {
      const runDate = schedule.nextRunDate
      const label = await generateDocument(schedule.type, template, runDate, userId ?? schedule.createdBy)

      const frequency = schedule.frequency
      if (!isRecurrenceFrequency(frequency)) throw new Error(`Frekuensi "${frequency}" tidak dikenal`)

      await prisma.recurringTransaction.update({
        where: { id: schedule.id },
        data: {
          lastRunAt: asOf,
          runCount: { increment: 1 },
          // Advance past every missed occurrence, so a scheduler that was down
          // for months does not try to fire the whole backlog next run.
          nextRunDate: nextRunAfter(runDate, frequency as RecurrenceFrequency, schedule.interval, asOf),
          lastResult: label,
        },
      })
      generated.push(`${schedule.name} → ${label}`)
    } catch (error) {
      const message = error instanceof Error ? error.message : "Gagal membuat dokumen"
      errors.push(`${schedule.name}: ${message}`)
      await prisma.recurringTransaction.update({ where: { id: schedule.id }, data: { lastResult: `Gagal: ${message}` } })
    }
  }

  return { processed: due.length, generated, errors }
}

