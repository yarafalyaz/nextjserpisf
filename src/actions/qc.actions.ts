"use server"

import { getErrorMessage, isNextRedirectError } from "@/lib/utils/error"
import { requirePermission } from "@/lib/auth/permissions"
import { prisma } from "@/lib/db/prisma"
import { generateDocumentNumber } from "@/lib/utils/document-number"
import { revalidatePath } from "next/cache"
import { logActivity } from "@/lib/services/activity-log.service"
import { parseFormData } from "@/lib/validations/parse-form"
import {
  createQcChecklistSchema,
  updateQcChecklistSchema,
  parseChecklistItems,
  createQcInspectionSchema,
  parseInspectionResults,
  createNonconformanceSchema,
  resolveNonconformanceSchema,
} from "@/lib/validations/qc.schemas"
import { raiseNonconformanceFromInspection } from "@/lib/services/qc.service"

// ==================== QC CHECKLIST ACTIONS ====================

/**
 * Create a QC master checklist with its items. The checklist starts as `draft`;
 * a released checklist is frozen (edits create a new version).
 */
export async function createQcChecklist(formData: FormData) {
  try {
    const user = await requirePermission("manage_qc_checklists")

    const parsed = parseFormData(createQcChecklistSchema, formData)
    if (!parsed.success) return { success: false, error: parsed.error }
    const v = parsed.data

    const names = formData.getAll("itemName") as string[]
    const methods = formData.getAll("itemMethod") as string[]
    const specs = formData.getAll("itemSpec") as string[]
    const required = formData.getAll("itemRequired") as string[]
    const itemsParsed = parseChecklistItems(names, methods, specs, required)
    if (!itemsParsed.success) return { success: false, error: itemsParsed.error }
    if (itemsParsed.data.length === 0) {
      return { success: false, error: "Checklist harus memiliki minimal satu item." }
    }

    const code = v.code || (await generateDocumentNumber("QCL", "simple"))

    const checklist = await prisma.qcChecklist.create({
      data: {
        code,
        name: v.name,
        checklistType: v.checklistType,
        productId: v.productId ?? null,
        version: 1,
        status: "draft",
        createdBy: Number(user.id),
        items: {
          create: itemsParsed.data.map((it, idx) => ({
            sortOrder: idx,
            itemName: it.itemName,
            method: it.method,
            spec: it.spec ?? null,
            isRequired: it.isRequired,
          })),
        },
      },
    })

    await logActivity("create", "QcChecklist", checklist.id, `Membuat checklist QC #${checklist.id}`)
    revalidatePath("/produksi/qc/checklist")
    return { success: true, id: checklist.id }
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[createQcChecklist]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

/** Edit a DRAFT checklist (metadata + items). A released checklist is frozen. */
export async function updateQcChecklist(id: number, formData: FormData) {
  try {
    await requirePermission("manage_qc_checklists")

    const parsed = parseFormData(updateQcChecklistSchema, formData)
    if (!parsed.success) return { success: false, error: parsed.error }
    const v = parsed.data

    const names = formData.getAll("itemName") as string[]
    const methods = formData.getAll("itemMethod") as string[]
    const specs = formData.getAll("itemSpec") as string[]
    const required = formData.getAll("itemRequired") as string[]
    const itemsParsed = parseChecklistItems(names, methods, specs, required)
    if (!itemsParsed.success) return { success: false, error: itemsParsed.error }
    if (itemsParsed.data.length === 0) {
      return { success: false, error: "Checklist harus memiliki minimal satu item." }
    }

    const existing = await prisma.qcChecklist.findUnique({
      where: { id },
      select: { status: true },
    })
    if (!existing) return { success: false, error: "Checklist tidak ditemukan" }
    if (existing.status !== "draft") {
      return { success: false, error: "Checklist yang sudah dirilis tidak dapat diubah; buat versi baru." }
    }

    await prisma.$transaction(async (tx) => {
      await tx.qcChecklist.update({
        where: { id },
        data: {
          code: v.code ?? null,
          name: v.name,
          checklistType: v.checklistType,
          productId: v.productId ?? null,
          items: {
            deleteMany: {},
            create: itemsParsed.data.map((it, idx) => ({
              sortOrder: idx,
              itemName: it.itemName,
              method: it.method,
              spec: it.spec ?? null,
              isRequired: it.isRequired,
            })),
          },
        },
      })
    })

    await logActivity("update", "QcChecklist", id, `Memperbarui checklist QC #${id}`)
    revalidatePath("/produksi/qc/checklist")
    return { success: true }
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[updateQcChecklist]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

/** Release a draft checklist (draft → released). Releasing an empty checklist
 * is rejected — an inspection against it would have nothing to check. */
export async function releaseQcChecklist(id: number) {
  try {
    const user = await requirePermission("manage_qc_checklists")

    const checklist = await prisma.qcChecklist.findUnique({
      where: { id },
      include: { _count: { select: { items: true } } },
    })
    if (!checklist) return { success: false, error: "Checklist tidak ditemukan" }
    if (checklist._count.items === 0) {
      return { success: false, error: "Checklist tidak boleh kosong sebelum dirilis." }
    }

    const claimed = await prisma.qcChecklist.updateMany({
      where: { id, status: "draft" },
      data: { status: "released", releasedAt: new Date(), releasedBy: Number(user.id) },
    })
    if (claimed.count === 0) {
      return { success: false, error: "Hanya checklist draft yang dapat dirilis." }
    }

    await logActivity("release", "QcChecklist", id, `Merilis checklist QC #${id}`)
    revalidatePath("/produksi/qc/checklist")
    return { success: true }
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[releaseQcChecklist]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

/** Delete a checklist that is still draft and has never been used by an inspection. */
export async function deleteQcChecklist(id: number) {
  try {
    await requirePermission("manage_qc_checklists")

    const checklist = await prisma.qcChecklist.findUnique({
      where: { id },
      select: { status: true, _count: { select: { inspections: true } } },
    })
    if (!checklist) return { success: false, error: "Checklist tidak ditemukan" }
    if (checklist.status !== "draft") {
      return { success: false, error: "Hanya checklist draft yang dapat dihapus." }
    }
    if (checklist._count.inspections > 0) {
      return { success: false, error: "Checklist sudah dipakai inspeksi dan tidak dapat dihapus." }
    }

    await prisma.qcChecklist.delete({ where: { id } })
    await logActivity("delete", "QcChecklist", id, `Menghapus checklist QC #${id}`)
    revalidatePath("/produksi/qc/checklist")
    return { success: true }
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[deleteQcChecklist]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

// ==================== QC INSPECTION ACTIONS ====================

/**
 * Record an inspection against a document using a released checklist. Results
 * are validated to belong to the checklist. Final status is derived: any FAIL
 * → `failed`, otherwise `passed`. A failed inspection is expected to raise NCRs
 * separately (or automatically, see `raiseNonconformanceFromInspection`).
 */
export async function createQcInspection(formData: FormData) {
  try {
    const user = await requirePermission("manage_qc_inspections")

    const parsed = parseFormData(createQcInspectionSchema, formData)
    if (!parsed.success) return { success: false, error: parsed.error }
    const v = parsed.data

    const itemIds = formData.getAll("resultItemId") as string[]
    const results = formData.getAll("resultValue") as string[]
    const measured = formData.getAll("resultMeasured") as string[]
    const notes = formData.getAll("resultNote") as string[]
    const rowsParsed = parseInspectionResults(itemIds, results, measured, notes)
    if (!rowsParsed.success) return { success: false, error: rowsParsed.error }

    const checklist = await prisma.qcChecklist.findUnique({
      where: { id: v.checklistId },
      include: { items: { select: { id: true, isRequired: true } } },
    })
    if (!checklist) return { success: false, error: "Checklist tidak ditemukan" }
    if (checklist.status !== "released") {
      return { success: false, error: "Inspeksi hanya dapat memakai checklist yang sudah dirilis." }
    }

    // Only results referencing items on this checklist are accepted.
    const validItemIds = new Set(checklist.items.map((it) => it.id))
    const submitted = rowsParsed.data.filter((r) => validItemIds.has(r.checklistItemId))

    // Every required item must have a result (PRD FAB-10: hasil lulus/gagal wajib tercatat).
    const requiredIds = checklist.items.filter((it) => it.isRequired).map((it) => it.id)
    const answeredIds = new Set(submitted.map((r) => r.checklistItemId))
    const missing = requiredIds.filter((id) => !answeredIds.has(id))
    if (missing.length > 0) {
      return {
        success: false,
        error: `Semua item wajib checklist harus dinilai. Belum dinilai: ${missing.length} item.`,
      }
    }

    const hasFail = submitted.some((r) => r.result === "fail")
    const status = hasFail ? "failed" : "passed"

    const documentNo = await generateDocumentNumber("QCI", "simple")

    const { inspection, raisedNcrIds } = await prisma.$transaction(async (tx) => {
      const inspection = await tx.qcInspection.create({
        data: {
          documentNo,
          checklistId: v.checklistId,
          inspectionType: v.inspectionType,
          referenceType: v.referenceType,
          referenceId: v.referenceId,
          status,
          inspectorId: Number(user.id),
          inspectedAt: new Date(),
          notes: v.notes ?? null,
          createdBy: Number(user.id),
          results: {
            create: submitted.map((r) => ({
              checklistItemId: r.checklistItemId,
              result: r.result,
              measuredValue: r.measuredValue ?? null,
              notes: r.notes ?? null,
            })),
          },
        },
      })

      // A failed inspection auto-raises one NCR per failed item (FAB-11) so a
      // defect cannot be silently dropped. Same transaction: a failure to record
      // the NCR rolls back the inspection too, keeping QC and NCR consistent.
      const raisedNcrIds =
        status === "failed"
          ? await raiseNonconformanceFromInspection(inspection.id, tx, Number(user.id))
          : []

      return { inspection, raisedNcrIds }
    })

    await logActivity(
      "create",
      "QcInspection",
      inspection.id,
      `Inspeksi QC ${documentNo} (${status}) untuk ${v.referenceType} #${v.referenceId}` +
        (raisedNcrIds.length > 0 ? ` — ${raisedNcrIds.length} NCR otomatis` : ""),
    )
    revalidatePath("/produksi/qc/inspeksi")
    revalidatePath("/produksi/qc/ncr")
    revalidatePath("/produksi/qc")
    return { success: true, id: inspection.id, status, raisedNcrIds }
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[createQcInspection]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

// ==================== NONCONFORMANCE ACTIONS ====================

/**
 * Raise a nonconformance (NCR). An NCR is `open` by default and blocks handover
 * of the referenced document (FAB-11) until it reaches a terminal status.
 */
export async function createNonconformance(formData: FormData) {
  try {
    const user = await requirePermission("manage_nonconformances")

    const parsed = parseFormData(createNonconformanceSchema, formData)
    if (!parsed.success) return { success: false, error: parsed.error }
    const v = parsed.data

    if (v.inspectionId) {
      const inspection = await prisma.qcInspection.findUnique({
        where: { id: v.inspectionId },
        select: { id: true },
      })
      if (!inspection) return { success: false, error: "Inspeksi tidak ditemukan" }
    }

    const documentNo = await generateDocumentNumber("NCR", "simple")

    const ncr = await prisma.nonconformance.create({
      data: {
        documentNo,
        inspectionId: v.inspectionId ?? null,
        referenceType: v.referenceType,
        referenceId: v.referenceId,
        defectDescription: v.defectDescription,
        cause: v.cause ?? null,
        responsibility: v.responsibility,
        severity: v.severity,
        status: "open",
        createdBy: Number(user.id),
      },
    })

    await logActivity("create", "Nonconformance", ncr.id, `Membuat NCR ${documentNo}`)
    revalidatePath("/produksi/qc/ncr")
    revalidatePath("/produksi/qc")
    return { success: true, id: ncr.id }
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[createNonconformance]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

/**
 * Resolve / advance an NCR. Moving to `closed` stamps closedBy/closedAt and is
 * what releases the handover gate. `inspectionId`-linked docs are unaffected by
 * this call other than through the gate check.
 */
export async function resolveNonconformance(id: number, formData: FormData) {
  try {
    const user = await requirePermission("manage_nonconformances")

    const parsed = parseFormData(resolveNonconformanceSchema, formData)
    if (!parsed.success) return { success: false, error: parsed.error }
    const v = parsed.data

    const existing = await prisma.nonconformance.findUnique({
      where: { id },
      select: { id: true, status: true },
    })
    if (!existing) return { success: false, error: "NCR tidak ditemukan" }
    if (existing.status === "closed") {
      return { success: false, error: "NCR sudah ditutup." }
    }

    await prisma.nonconformance.update({
      where: { id },
      data: {
        status: v.status,
        resolution: v.resolution ?? null,
        reworkCost: v.reworkCost,
        reworkHours: v.reworkHours,
        ...(v.status === "closed" ? { closedBy: Number(user.id), closedAt: new Date() } : {}),
      },
    })

    await logActivity("update", "Nonconformance", id, `NCR #${id} → ${v.status}`)
    revalidatePath("/produksi/qc/ncr")
    revalidatePath("/produksi/qc")
    return { success: true }
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[resolveNonconformance]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}
