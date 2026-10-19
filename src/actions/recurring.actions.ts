"use server"

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { logActivity } from "@/lib/services/activity-log.service"
import { parseFormData } from "@/lib/validations/parse-form"
import { recurringTransactionSchema, type RecurringTransactionInput } from "@/lib/validations/recurring.schemas"
import { getErrorMessage, isNextRedirectError } from "@/lib/utils/error"
import { nextSlug } from "@/lib/utils/slug-db"
import {
  parseRecurringTemplate,
  recurringJournalLines,
  recurringJournalReference,
  runDueRecurring,
  validateRecurringTemplate,
  type RecurringTemplate,
} from "@/lib/services/recurring.service"
import { assertPeriodOpen } from "@/lib/services/period-lock.service"
import { isRecurrenceFrequency, nextRunAfter } from "@/lib/reports/recurring-schedule"
import { generateDocumentNumber } from "@/lib/utils/document-number"

/** Turn the flat form fields into the JSON template stored on the schedule. */
function buildTemplate(v: RecurringTransactionInput): RecurringTemplate {
  if (v.type === "journal") {
    return {
      description: v.description,
      lines: [
        { accountId: v.debitAccountId!, debit: v.amount, credit: 0, memo: v.description },
        { accountId: v.creditAccountId!, debit: 0, credit: v.amount, memo: v.description },
      ],
    }
  }
  return {
    accountId: v.accountId,
    paidFromAccountId: v.paidFromAccountId,
    categoryId: v.categoryId,
    amount: v.amount,
    description: v.description,
  }
}

export async function createRecurringTransaction(formData: FormData) {
  try {
    const user = await requirePermission("manage_recurring_transactions")

    const parsed = parseFormData(recurringTransactionSchema, formData)
    if (!parsed.success) return { success: false, error: parsed.error }
    const v = parsed.data

    const template = buildTemplate(v)
    const invalid = validateRecurringTemplate(v.type, template)
    if (invalid) return { success: false, error: invalid }

    const slug = await nextSlug("recurringTransaction", v.name)
    const created = await prisma.recurringTransaction.create({
      data: {
        slug,
        name: v.name.trim(),
        type: v.type,
        frequency: v.frequency,
        interval: v.interval,
        startDate: new Date(v.startDate),
        endDate: v.endDate ? new Date(v.endDate) : null,
        nextRunDate: new Date(v.startDate),
        template: JSON.stringify(template),
        isActive: v.isActive,
        createdBy: Number(user.id),
      },
    })

    await logActivity("create", "RecurringTransaction", created.id, `Menambah transaksi berulang ${created.name}`)
    revalidatePath("/pengaturan/transaksi-berulang")
    return { success: true, id: created.id, slug }
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[createRecurringTransaction]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

export async function updateRecurringTransaction(id: number, formData: FormData) {
  try {
    await requirePermission("manage_recurring_transactions")

    const parsed = parseFormData(recurringTransactionSchema, formData)
    if (!parsed.success) return { success: false, error: parsed.error }
    const v = parsed.data

    const template = buildTemplate(v)
    const invalid = validateRecurringTemplate(v.type, template)
    if (invalid) return { success: false, error: invalid }

    const existing = await prisma.recurringTransaction.findUniqueOrThrow({ where: { id } })
    if (existing.deletedAt) return { success: false, error: "Jadwal transaksi berulang sudah dihapus." }
    const slug = await nextSlug("recurringTransaction", v.name, { excludeId: id })

    // Only re-anchor the schedule when the start date actually moved — otherwise
    // editing the amount would silently reset a schedule that is already running.
    const startChanged = existing.startDate.getTime() !== new Date(v.startDate).getTime()

    await prisma.recurringTransaction.update({
      where: { id },
      data: {
        slug,
        name: v.name.trim(),
        type: v.type,
        frequency: v.frequency,
        interval: v.interval,
        startDate: new Date(v.startDate),
        endDate: v.endDate ? new Date(v.endDate) : null,
        nextRunDate: startChanged ? new Date(v.startDate) : existing.nextRunDate,
        template: JSON.stringify(template),
        isActive: v.isActive,
      },
    })

    await logActivity("update", "RecurringTransaction", id, `Memperbarui transaksi berulang ${v.name}`)
    revalidatePath("/pengaturan/transaksi-berulang")
    return { success: true, id, slug }
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[updateRecurringTransaction]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

export async function deleteRecurringTransaction(id: number) {
  try {
    await requirePermission("manage_recurring_transactions")

    await prisma.recurringTransaction.update({ where: { id }, data: { deletedAt: new Date(), isActive: false } })

    await logActivity("delete", "RecurringTransaction", id, "Menghapus transaksi berulang")
    revalidatePath("/pengaturan/transaksi-berulang")
    return { success: true }
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[deleteRecurringTransaction]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

/** Generates one document for a single schedule right now, then re-anchors it. */
export async function runRecurringNow(id: number) {
  try {
    const user = await requirePermission("manage_recurring_transactions")

    const schedule = await prisma.recurringTransaction.findUniqueOrThrow({ where: { id } })
    // Cron path (runDueRecurring) hanya jalan untuk isActive && deletedAt null;
    // jalur manual wajib sama, atau jadwal terhapus/nonaktif hidup lagi via tombol/API.
    if (schedule.deletedAt) return { success: false, error: "Jadwal transaksi berulang sudah dihapus." }
    if (!schedule.isActive) return { success: false, error: "Jadwal transaksi berulang tidak aktif." }
    const template = parseRecurringTemplate(schedule.template)
    const invalid = validateRecurringTemplate(schedule.type, template)
    if (invalid) return { success: false, error: invalid }
    if (!isRecurrenceFrequency(schedule.frequency)) {
      return { success: false, error: `Frekuensi "${schedule.frequency}" tidak dikenal` }
    }
    const frequency = schedule.frequency

    const now = new Date()
    const runDate = schedule.nextRunDate.getTime() > now.getTime() ? now : schedule.nextRunDate

    const label = await prisma.$transaction(async (tx) => {
      let summary: string
      if (schedule.type === "journal") {
        const { lines, totalDebit, totalCredit } = recurringJournalLines(template)
        const { referenceType, referenceId } = recurringJournalReference(schedule.id, runDate)

        // Period key — same rule as the cron path (recurring.service): a journal must
        // not be dated inside a closed period, because it could never be posted.
        await assertPeriodOpen(runDate, tx)

        // One schedule = one journal per document date; a repeated "jalankan sekarang"
        // on the same day reuses the existing journal instead of tripping the unique
        // (referenceType, referenceId) pair.
        const existing = await tx.journal.findFirst({
          where: { referenceType, referenceId },
          select: { journalNumber: true },
        })
        if (existing) {
          summary = `Jurnal ${existing.journalNumber} (sudah ada, dilewati)`
        } else {
          const journalNumber = await generateDocumentNumber("JRN")
          const journal = await tx.journal.create({
            data: {
              journalNumber,
              slug: await nextSlug("journal", journalNumber),
              transactionDate: runDate,
              referenceType,
              referenceId,
              description: template.description ?? `Transaksi berulang: ${schedule.name}`,
              type: "GENERAL",
              status: "DRAFT",
              totalDebit,
              totalCredit,
              createdBy: Number(user.id),
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
          summary = `Jurnal ${journal.journalNumber}`
        }
      } else {
        const documentNo = await generateDocumentNumber("EXP")
        await tx.expense.create({
          data: {
            documentNo,
            slug: await nextSlug("expense", documentNo),
            accountId: template.accountId!,
            paidFromAccountId: template.paidFromAccountId ?? null,
            categoryId: template.categoryId ?? null,
            amount: template.amount!,
            date: runDate,
            description: template.description ?? `Beban berulang: ${schedule.name}`,
            status: "draft",
            createdBy: Number(user.id),
          },
        })
        summary = `Beban ${documentNo}`
      }

      await tx.recurringTransaction.update({
        where: { id },
        data: {
          lastRunAt: now,
          runCount: { increment: 1 },
          nextRunDate: nextRunAfter(schedule.nextRunDate, frequency, schedule.interval, now),
          lastResult: summary,
        },
      })

      return summary
    })

    await logActivity("process", "RecurringTransaction", id, `Menjalankan transaksi berulang ${schedule.name}: ${label}`)
    revalidatePath("/pengaturan/transaksi-berulang")
    revalidatePath("/kalender")
    return { success: true, message: label }
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[runRecurringNow]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

/** Runs every schedule whose nextRunDate has passed (also used by the cron route). */
export async function runAllDueRecurring(): Promise<
  { success: true; processed: number; generated: string[]; errors: string[] } | { success: false; error: string }
> {
  try {
    const user = await requirePermission("manage_recurring_transactions")

    const result = await runDueRecurring(new Date(), Number(user.id))

    await logActivity(
      "process",
      "RecurringTransaction",
      0,
      `Menjalankan transaksi berulang jatuh tempo: ${result.generated.length} dokumen, ${result.errors.length} gagal`,
    )
    revalidatePath("/pengaturan/transaksi-berulang")
    revalidatePath("/kalender")
    return { success: true, ...result }
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[runAllDueRecurring]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}
