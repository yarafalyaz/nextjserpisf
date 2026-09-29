"use server"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { revalidatePath } from "next/cache"
import { logActivity } from "@/lib/services/activity-log.service"
import { getErrorMessage } from "@/lib/utils/error"
import { requireId, requireString } from "@/lib/utils/safe-parse"
import { assertPeriodOpen } from "@/lib/services/period-lock.service"

// ─────────────────────────────────────────────────────────────────────────────
// List all allocation rules
// ─────────────────────────────────────────────────────────────────────────────
export async function getAllocationRules() {
  try {
    await requirePermission("view_statistical_key_figures")
    const rules = await prisma.allocationRule.findMany({
      include: {
        sourceAccount: { select: { id: true, code: true, name: true } },
        skf: { select: { id: true, name: true, unit: true } },
        targets: {
          include: { costCenter: { select: { id: true, code: true, name: true } } },
        },
      },
      orderBy: { name: "asc" },
    })
    return { success: true, data: rules }
  } catch (e: unknown) {
    console.error("[getAllocationRules]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Gagal memuat data"), data: [] }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Create allocation rule
// ─────────────────────────────────────────────────────────────────────────────
export async function createAllocationRule(formData: FormData) {
  try {
    await requirePermission("edit_accounts")

    const name = requireString(formData.get("name"), "Nama")
    const sourceAccountId = requireId(formData.get("sourceAccountId"), "Akun sumber")
    const skfId = requireId(formData.get("skfId"), "Key Figure")
    const description = (formData.get("description") as string) || null

    if (!Number.isSafeInteger(sourceAccountId) || !Number.isSafeInteger(skfId)) {
      return { success: false, error: "Akun sumber atau Key Figure tidak valid" }
    }

    const rawTargetIds = formData.getAll("targetIds[]")
    const parsedTargetIds = rawTargetIds.map((value) => {
      if (typeof value !== "string" || !/^\d+$/.test(value)) return null
      const id = Number(value)
      return Number.isSafeInteger(id) && id > 0 ? id : null
    })
    if (parsedTargetIds.some((id) => id === null)) {
      return { success: false, error: "Pusat biaya tidak valid" }
    }
    const targetIds = Array.from(new Set(parsedTargetIds as number[]))
    if (targetIds.length > 0) {
      const activeCenters = await prisma.costCenter.findMany({
        where: { id: { in: targetIds }, isActive: true },
        select: { id: true },
      })
      if (activeCenters.length !== targetIds.length) {
        return { success: false, error: "Satu atau lebih pusat biaya tidak aktif atau tidak ditemukan" }
      }
    }

    const rule = await prisma.allocationRule.create({
      data: {
        name,
        sourceAccountId,
        skfId,
        description,
        targets: {
          create: targetIds.map((costCenterId) => ({ costCenterId })),
        },
      },
    })

    revalidatePath("/anggaran/alokasi-skf")
    await logActivity("create", "AllocationRule", rule.id, `Membuat aturan alokasi: ${name}`)
    return { success: true, id: rule.id }
  } catch (e: unknown) {
    console.error("[createAllocationRule]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Gagal membuat aturan") }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Delete allocation rule
// ─────────────────────────────────────────────────────────────────────────────
export async function deleteAllocationRule(id: number) {
  try {
    await requirePermission("delete_accounts")
    if (!Number.isSafeInteger(id) || id < 1) {
      return { success: false, error: "Aturan alokasi tidak valid" }
    }
    await prisma.allocationRule.delete({ where: { id } })
    revalidatePath("/anggaran/alokasi-skf")
    await logActivity("delete", "AllocationRule", id, "Menghapus aturan alokasi")
    return { success: true }
  } catch (e: unknown) {
    console.error("[deleteAllocationRule]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Gagal menghapus") }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Execute allocation — generate journal entries based on SKF proportions
// ─────────────────────────────────────────────────────────────────────────────
export async function executeAllocation(ruleId: number, period: string) {
  try {
    await requirePermission("edit_accounts")

    if (!Number.isSafeInteger(ruleId) || ruleId < 1) {
      return { success: false, error: "Aturan alokasi tidak valid" }
    }
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) {
      return { success: false, error: "Format periode harus YYYY-MM" }
    }

    const rule = await prisma.allocationRule.findUnique({
      where: { id: ruleId },
      include: {
        sourceAccount: true,
        skf: true,
        targets: { include: { costCenter: true } },
      },
    })
    if (!rule) return { success: false, error: "Aturan tidak ditemukan" }
    if (!rule.isActive) return { success: false, error: "Aturan alokasi tidak aktif" }

    const periodReferenceType = `AllocationRule:${period}`
    const legacyDescription = `Alokasi ${rule.name} periode ${period}`

    // Determine target cost centers
    let targetCcIds: number[]
    if (rule.targets.length > 0) {
      targetCcIds = rule.targets.map((t) => t.costCenterId)
    } else {
      // Use ALL active cost centers
      const all = await prisma.costCenter.findMany({
        where: { isActive: true },
        select: { id: true },
      })
      targetCcIds = all.map((c) => c.id)
    }

    // Get SKF values for the period
    const skfValues = await prisma.skfValue.findMany({
      where: { statisticalKeyFigureId: rule.skfId, period, costCenterId: { in: targetCcIds } },
      include: { costCenter: true },
    })

    if (skfValues.length === 0) {
      return { success: false, error: `Tidak ada nilai SKF untuk periode ${period}` }
    }
    if (skfValues.some((value) => Number(value.value) < 0)) {
      return { success: false, error: "Nilai SKF untuk alokasi tidak boleh negatif" }
    }

    // Calculate total SKF value
    const totalSkf = skfValues.reduce((s, v) => s + Number(v.value), 0)
    if (totalSkf <= 0) {
      return { success: false, error: "Total nilai SKF harus > 0" }
    }

    // Get source account balance for the period
    const [yearStr, monthStr] = period.split("-")
    const periodStart = new Date(Number(yearStr), Number(monthStr) - 1, 1)
    const periodEnd = new Date(Number(yearStr), Number(monthStr), 1)
    await assertPeriodOpen(periodStart)

    const entries = await prisma.journalEntry.findMany({
      where: {
        accountId: rule.sourceAccountId,
        journal: { transactionDate: { gte: periodStart, lt: periodEnd }, status: "POSTED" },
      },
    })

    const totalBalance = entries.reduce((s, e) => s + Number(e.debit) - Number(e.credit), 0)
    if (totalBalance <= 0) {
      return { success: false, error: `Saldo akun ${rule.sourceAccount.code} untuk periode ${period} adalah 0 atau negatif` }
    }

    // Build allocation journal entries
    const sorted = skfValues.sort((a, b) => (a.costCenterId ?? 0) - (b.costCenterId ?? 0))
    const totalBalanceCents = Math.round(totalBalance * 100)
    let allocatedCents = 0
    const journalEntries = sorted.map((sv, index) => {
      const shareCents = index === sorted.length - 1
        ? totalBalanceCents - allocatedCents
        : Math.round((Number(sv.value) / totalSkf) * totalBalanceCents)
      allocatedCents += shareCents
      const share = shareCents / 100
      return {
        accountId: rule.sourceAccountId,
        debit: share,
        credit: 0,
        memo: `Alokasi ${rule.skf.name}: ${sv.costCenter?.code ?? ""} (${Number(sv.value).toFixed(2)}/${totalSkf.toFixed(2)})`,
        costCenterId: sv.costCenterId,
      }
    })

    // Credit the total back (net zero on account, but assigns cost centers)
    journalEntries.push({
      accountId: rule.sourceAccountId,
      debit: 0,
      credit: totalBalance,
      memo: `Alokasi ${rule.name} - reversing total`,
      costCenterId: null,
    })

    // Create the journal with ALC prefix
    const ts = new Date().toISOString().replace(/[-:T.Z]/g, "").slice(0, 14)
    const journalNumber = `ALC-${rule.id}/${ts}`
    // Serialize executions of the same rule. The pre-check alone is racy: two
    // simultaneous requests could both see no journal and post duplicates.
    const posted = await prisma.$transaction(async (tx) => {
      const lockedRule = await tx.$queryRaw<Array<{ id: number }>>`
        SELECT id FROM allocation_rules WHERE id = ${rule.id} FOR UPDATE
      `
      if (lockedRule.length === 0) throw new Error("Aturan alokasi tidak ditemukan")

      const existingJournal = await tx.journal.findFirst({
        where: {
          OR: [
            { referenceType: periodReferenceType, referenceId: rule.id },
            { referenceType: "AllocationRule", referenceId: rule.id, description: legacyDescription },
          ],
        },
        select: { id: true },
      })
      if (existingJournal) return false

      await tx.journal.create({
        data: {
          journalNumber,
          transactionDate: periodStart,
          referenceType: periodReferenceType,
          referenceId: rule.id,
          description: legacyDescription,
          type: "AUTO",
          status: "POSTED",
          totalDebit: totalBalance,
          totalCredit: totalBalance,
          entries: { create: journalEntries },
        },
      })
      return true
    })
    if (!posted) {
      return { success: false, error: `Aturan alokasi sudah dijalankan untuk periode ${period}` }
    }

    revalidatePath("/anggaran/alokasi-skf")
    await logActivity("create", "Journal", rule.id, `Eksekusi alokasi ${rule.name} periode ${period}`)
    return { success: true, journalNumber }
  } catch (e: unknown) {
    console.error("[executeAllocation]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Gagal mengeksekusi alokasi") }
  }
}
