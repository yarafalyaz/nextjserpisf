"use server"

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { logActivity } from "@/lib/services/activity-log.service"
import { parseFormData } from "@/lib/validations/parse-form"
import { recurringTransactionSchema, type RecurringTransactionInput } from "@/lib/validations/recurring.schemas"
import { wibDateToUtcMidnight } from "@/lib/utils/attendance-time"
import { getErrorMessage, isNextRedirectError } from "@/lib/utils/error"
import { nextSlug, nextSlugWithClient } from "@/lib/utils/slug-db"
import { checkIdempotency } from "@/lib/utils/idempotency"
import {
  parseRecurringTemplate,
  recurringJournalLines,
  recurringJournalReference,
  runDueRecurring,
  validateRecurringTemplate,
  type RecurringTemplate,
} from "@/lib/services/recurring.service"
import { assertAccountsExist } from "@/lib/hooks/accounting.hook"
import { assertPeriodOpen } from "@/lib/services/period-lock.service"
import { isRecurrenceFrequency, isWithinSchedule, nextRunAfter } from "@/lib/reports/recurring-schedule"
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

    // Putaran 65: key wajib — retry melahirkan jadwal aktif kembar; runner
    // mengklaim per baris jadwal (bukan per pasangan), sehingga cabang
    // expense/jurnal keduanya memposting dokumen dobel per occurrence.
    const idempotencyKey = String(formData.get("idempotencyKey") ?? "").trim()
    if (!idempotencyKey) return { success: false, error: "Idempotency key wajib diisi." }

    const parsed = parseFormData(recurringTransactionSchema, formData)
    if (!parsed.success) return { success: false, error: parsed.error }
    const v = parsed.data

    const template = buildTemplate(v)
    const invalid = validateRecurringTemplate(v.type, template)
    if (invalid) return { success: false, error: invalid }

    // Putaran 77: slug dihitung di dalam tx lewat delegate tx — slug global
    // tidak melihat baris tak-tercommit transaksi lain, jadi dua create
    // bersamaan bisa memilih slug sama lalu satu kalah P2002.
    let createdSlug: string | null = null
    const created = await prisma.$transaction(async (tx) => {
      await checkIdempotency(idempotencyKey, tx, user.id)
      createdSlug = await nextSlugWithClient(tx as never, "recurringTransaction", v.name)
      return tx.recurringTransaction.create({
        data: {
          slug: createdSlug,
          name: v.name.trim(),
          type: v.type,
          frequency: v.frequency,
          interval: v.interval,
          startDate: wibDateToUtcMidnight(v.startDate),
          endDate: v.endDate ? wibDateToUtcMidnight(v.endDate) : null,
          nextRunDate: wibDateToUtcMidnight(v.startDate),
          template: JSON.stringify(template),
          isActive: v.isActive,
          createdBy: Number(user.id),
        },
      })
    })

    await logActivity("create", "RecurringTransaction", created.id, `Menambah transaksi berulang ${created.name}`)
    revalidatePath("/pengaturan/transaksi-berulang")
    return { success: true, id: created.id, slug: createdSlug }
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

    // Only re-anchor the schedule when the start date actually moved — otherwise
    // editing the amount would silently reset a schedule that is already running.
    const startChanged = existing.startDate.getTime() !== wibDateToUtcMidnight(v.startDate).getTime()

    // Putaran 77: slug + klaim dalam satu tx (delegate tx untuk slug).
    // Klaim kondisional pada nextRunDate yang dibaca: runner memakai kunci
    // optimistis yang sama untuk memajukan jadwal. Tanpa syarat ini, edit
    // yang mulai sebelum runner commit menulis ulang nextRunDate lama dan
    // occurrence yang sama terbit dua kali.
    let slug: string | null = null
    const claimCount = await prisma.$transaction(async (tx) => {
      slug = await nextSlugWithClient(tx as never, "recurringTransaction", v.name, { excludeId: id })
      const claimed = await tx.recurringTransaction.updateMany({
        where: { id, nextRunDate: existing.nextRunDate, deletedAt: null },
        data: {
          slug,
          name: v.name.trim(),
          type: v.type,
          frequency: v.frequency,
          interval: v.interval,
          startDate: wibDateToUtcMidnight(v.startDate),
          endDate: v.endDate ? wibDateToUtcMidnight(v.endDate) : null,
          nextRunDate: startChanged ? wibDateToUtcMidnight(v.startDate) : existing.nextRunDate,
          template: JSON.stringify(template),
          isActive: v.isActive,
        },
      })
      return claimed.count
    })
    if (claimCount === 0) {
      return { success: false, error: "Jadwal sudah berubah atau dijalankan eksekusi lain; muat ulang halaman sebelum menyimpan." }
    }

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
    if (!isWithinSchedule(schedule.nextRunDate, schedule.startDate, schedule.endDate)) {
      return { success: false, error: "Jadwal transaksi berulang sudah melewati tanggal akhir." }
    }
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
      // Klaim atomik (pola updateMany bersyarat repo): jadwal hanya boleh
      // dimajukan oleh eksekusi yang masih melihat nextRunDate lama. Klaim di
      // dalam tx yang sama dengan pembuatan dokumen — dokumen gagal = klaim
      // ikut rollback; klaim kalah (count 0) = tidak ada dokumen kedua.
      // Putaran 22: klaim terikat status hidup juga (pola runDueRecurring
      // putaran 20) — hapus/nonaktifkan konkuren yang tak mengubah
      // nextRunDate tak boleh kalah oleh klaim ini.
      const claimed = await tx.recurringTransaction.updateMany({
        where: { id, nextRunDate: schedule.nextRunDate, isActive: true, deletedAt: null },
        data: {
          lastRunAt: now,
          runCount: { increment: 1 },
          nextRunDate: nextRunAfter(schedule.nextRunDate, frequency, schedule.interval, now),
        },
      })
      if (claimed.count === 0) {
        return "Jadwal sudah dijalankan eksekusi lain (dilewati)"
      }

      let summary: string
      if (schedule.type === "journal") {
        const { lines, totalDebit, totalCredit } = recurringJournalLines(template)
        await assertAccountsExist(tx, lines.map((line) => line.accountId), "Transaksi berulang")
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
        await assertAccountsExist(tx, [template.accountId, template.paidFromAccountId], "Transaksi berulang")
        // Sama seperti jalur cron/jurnal: draft di periode tertutup takkan bisa
        // dijurnal onExpenseApproved, jadi gagal keras sebelum menulis apa pun.
        await assertPeriodOpen(runDate, tx)

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
        data: { lastResult: summary },
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
