"use server"

/**
 * Aksi pengajuan ganti revisi BOM pada order berjalan (F-2026-10-22-068-S).
 *
 * Putusan BOT 1 Q-BOM68-1..6 (merge PR #561) + bentuk fisik Q-BOM68-3
 * BOT 3 (komentar t_ce43e5d7):
 * - kelola = edit_manufacture_orders (WO) / edit_production_orders (PO),
 *   lihat = view_manufacture_orders / view_production_orders;
 * - material sudah ter-issue (MaterialIssueItem completed>0 WO, atau
 *   ProductionOrderMaterial issuedQty>0 PO) → SELALU jalur persetujuan,
 *   dilarang pin berubah diam-diam (BR-BOM68-01/02);
 * - belum ter-issue → langsung diterapkan, pin diganti di transaksi sama
 *   (status diterapkan_langsung);
 * - dari-pin harus pin dokumen saat ini; target wajib released, produk
 *   sama, beda revisi; alasan wajib; satu pengajuan `menunggu` per
 *   dokumen (penjaga di transaksi);
 * - setujui/tolak: penyetuju != pengaju (SoD), tolak wajib alasan, pin
 *   diganti dalam transaksi persetujuan yang sama (BR-BOM68-05/06).
 *
 * Semua aksi TIDAK PERNAH membuat StockMove/MaterialIssue/ProductionCost/
 * jurnal (vonis BOT 4 F-074-V dirujuk BR-BOM68-09) dan tidak menyentuh
 * StockReservation (BR-BOM68-10: status tampil saja di builder delta
 * bom-revision-impact.ts). Bukti nol-efek di
 * src/actions/__tests__/bom-revision-change.actions.test.ts.
 */

import { revalidatePath } from "next/cache"
import { prisma, type TxClient } from "@/lib/db/prisma"
import { requireAuth, requirePermission } from "@/lib/auth/permissions"
import { getErrorMessage, isNextRedirectError } from "@/lib/utils/error"
import { logActivity } from "@/lib/services/activity-log.service"

type Result<T extends object = object> =
  | ({ success: true } & T)
  | { success: false; error: string }

const WO_CLOSED = ["completed", "cancelled", "closed"]
const PO_CLOSED = ["completed", "cancelled", "closed"]

function ownerWhere(input: { workOrderId?: number; productionOrderId?: number }) {
  return input.workOrderId != null
    ? { workOrderId: input.workOrderId }
    : { productionOrderId: input.productionOrderId! }
}

function ownerPermission(owner: "wo" | "po", kind: "kelola" | "lihat") {
  if (owner === "wo") return kind === "kelola" ? "edit_work_orders" : "view_work_orders"
  return kind === "kelola" ? "edit_production_orders" : "view_production_orders"
}

function isUniqueViolation(e: unknown): boolean {
  return (
    typeof e === "object" &&
    e !== null &&
    (e as { code?: string }).code === "P2002"
  )
}

/** Sudah ada material keluar untuk dokumen pemilik? (BR-BOM68-01) */
async function ownerHasIssuedMaterial(
  tx: TxClient,
  owner: "wo" | "po",
  ownerId: number,
): Promise<boolean> {
  if (owner === "wo") {
    const count = await tx.materialIssueItem.count({
      where: {
        materialIssue: { workOrderId: ownerId, status: "completed" },
        qty: { gt: 0 },
      },
    })
    return count > 0
  }
  const count = await tx.productionOrderMaterial.count({
    where: { productionOrderId: ownerId, issuedQty: { gt: 0 } },
  })
  return count > 0
}

export async function requestBomRevisionChange(input: {
  workOrderId?: number
  productionOrderId?: number
  toRevisionId: number
  reason: string
}): Promise<Result<{ id: number; status: string }>> {
  try {
    const hasWo = input.workOrderId != null
    const hasPo = input.productionOrderId != null
    if (hasWo === hasPo) {
      return { success: false, error: "Tentukan tepat satu dokumen pemilik: perintah kerja atau order produksi." }
    }
    const owner: "wo" | "po" = hasWo ? "wo" : "po"
    const ownerId = (hasWo ? input.workOrderId : input.productionOrderId)!
    const reason = input.reason?.trim() ?? ""
    if (!reason) return { success: false, error: "Alasan ganti revisi BOM wajib diisi." }
    if (!Number.isInteger(input.toRevisionId) || input.toRevisionId <= 0) {
      return { success: false, error: "Revisi BOM tujuan tidak valid." }
    }
    const user = await requirePermission(ownerPermission(owner, "kelola"))

    const created = await prisma.$transaction(async (tx) => {
      // Kunci baris dokumen pemilik supaya cek pin + cek pengajuan
      // menunggu + tulis tidak berlomba.
      if (owner === "wo") {
        await tx.$queryRaw`SELECT id FROM work_orders WHERE id = ${ownerId} FOR UPDATE`
      } else {
        await tx.$queryRaw`SELECT id FROM production_orders WHERE id = ${ownerId} FOR UPDATE`
      }

      const doc =
        owner === "wo"
          ? await tx.workOrder.findFirst({
              where: { id: ownerId },
              select: { id: true, documentNo: true, status: true, bomRevisionId: true },
            })
          : await tx.productionOrder.findFirst({
              where: { id: ownerId },
              select: { id: true, documentNo: true, status: true, bomRevisionId: true, productId: true },
            })
      if (!doc) return { error: "Dokumen pemilik tidak ditemukan." }
      const closedList = owner === "wo" ? WO_CLOSED : PO_CLOSED
      if (closedList.includes(doc.status)) {
        return { error: `Dokumen ${doc.documentNo} sudah ${doc.status}; ganti revisi BOM tidak dapat diajukan.` }
      }
      if (doc.bomRevisionId == null) {
        return { error: `Dokumen ${doc.documentNo} belum mem-pin revisi BOM; tidak ada revisi lama untuk diganti.` }
      }
      const fromRevisionId = doc.bomRevisionId
      if (input.toRevisionId === fromRevisionId) {
        return { error: "Revisi tujuan sama dengan revisi yang sedang dipakai." }
      }

      const fromRevision = await tx.bomRevision.findFirst({
        where: { id: fromRevisionId },
        select: { id: true, productId: true, revisionNo: true },
      })
      if (!fromRevision) return { error: "Revisi BOM yang sedang dipakai tidak ditemukan." }
      const toRevision = await tx.bomRevision.findFirst({
        where: { id: input.toRevisionId },
        select: { id: true, productId: true, revisionNo: true, status: true },
      })
      if (!toRevision) return { error: "Revisi BOM tujuan tidak ditemukan." }
      if (toRevision.status !== "released") {
        return { error: "Revisi BOM tujuan belum dirilis; hanya revisi released yang boleh dipakai." }
      }
      if (toRevision.productId !== fromRevision.productId) {
        return { error: "Revisi BOM tujuan untuk produk berbeda; ganti revisi hanya dalam produk yang sama." }
      }

      // Satu pengajuan menunggu per dokumen (penjaga di transaksi).
      const pending = await tx.bomRevisionChangeRequest.findFirst({
        where: { ...ownerWhere(input), status: "menunggu" },
        select: { id: true },
      })
      if (pending) {
        return { error: "Masih ada pengajuan ganti revisi BOM yang menunggu keputusan untuk dokumen ini." }
      }

      const issued = await ownerHasIssuedMaterial(tx, owner, ownerId)
      const now = new Date()
      if (!issued) {
        // BR-BOM68-02: belum ter-issue = langsung diterapkan, pin diganti
        // dalam transaksi yang sama; tidak perlu putusan kedua.
        const change = await tx.bomRevisionChangeRequest.create({
          data: {
            ...ownerWhere(input),
            fromRevisionId,
            toRevisionId: input.toRevisionId,
            reason,
            status: "diterapkan_langsung",
            requestedBy: Number(user.id),
            decidedBy: Number(user.id),
            decidedAt: now,
          },
          select: { id: true },
        })
        if (owner === "wo") {
          await tx.workOrder.update({
            where: { id: ownerId },
            data: { bomRevisionId: input.toRevisionId },
          })
        } else {
          await tx.productionOrder.update({
            where: { id: ownerId },
            data: { bomRevisionId: input.toRevisionId },
          })
        }
        return {
          id: change.id,
          status: "diterapkan_langsung",
          documentNo: doc.documentNo,
          fromRevisionNo: fromRevision.revisionNo,
          toRevisionNo: toRevision.revisionNo,
        }
      }

      const change = await tx.bomRevisionChangeRequest.create({
        data: {
          ...ownerWhere(input),
          fromRevisionId,
          toRevisionId: input.toRevisionId,
          reason,
          status: "menunggu",
          requestedBy: Number(user.id),
        },
        select: { id: true },
      })
      return {
        id: change.id,
        status: "menunggu",
        documentNo: doc.documentNo,
        fromRevisionNo: fromRevision.revisionNo,
        toRevisionNo: toRevision.revisionNo,
      }
    })

    if ("error" in created) return { success: false, error: String(created.error) }
    await logActivity(
      created.status === "diterapkan_langsung" ? "update" : "create",
      "BomRevisionChangeRequest",
      created.id,
      created.status === "diterapkan_langsung"
        ? `Mengganti revisi BOM ${created.documentNo} dari revisi #${created.fromRevisionNo} ke #${created.toRevisionNo} (langsung, belum ter-issue): ${reason}`
        : `Mengajukan ganti revisi BOM ${created.documentNo} dari revisi #${created.fromRevisionNo} ke #${created.toRevisionNo}: ${reason}`,
    )
    revalidatePath("/produksi/work-orders")
    revalidatePath("/produksi/production-orders")
    return { success: true, id: created.id, status: created.status }
  } catch (error) {
    if (isNextRedirectError(error)) throw error
    if (isUniqueViolation(error)) {
      return { success: false, error: "Masih ada pengajuan ganti revisi BOM yang menunggu keputusan untuk dokumen ini." }
    }
    return { success: false, error: getErrorMessage(error) }
  }
}

export async function decideBomRevisionChange(input: {
  changeRequestId: number
  decision: "setujui" | "tolak"
  decisionReason?: string
}): Promise<Result<{ id: number; status: string }>> {
  try {
    if (input.decision !== "setujui" && input.decision !== "tolak") {
      return { success: false, error: "Keputusan tidak valid." }
    }
    const decisionReason = input.decisionReason?.trim() ? input.decisionReason.trim() : null
    if (input.decision === "tolak" && !decisionReason) {
      return { success: false, error: "Penolakan wajib mengisi alasan." }
    }

    // Izin mengikuti dokumen pemilik pengajuan. requireAuth dulu supaya sesi
    // anonim ditolak sebelum probe ada/tidaknya pengajuan membocorkan info.
    await requireAuth()
    const probe = await prisma.bomRevisionChangeRequest.findFirst({
      where: { id: input.changeRequestId },
      select: { workOrderId: true, productionOrderId: true },
    })
    if (!probe) return { success: false, error: "Pengajuan ganti revisi BOM tidak ditemukan." }
    const owner: "wo" | "po" = probe.workOrderId != null ? "wo" : "po"
    const user = await requirePermission(ownerPermission(owner, "kelola"))

    const decided = await prisma.$transaction(async (tx) => {
      if (owner === "wo") {
        await tx.$queryRaw`SELECT id FROM work_orders WHERE id = ${probe.workOrderId!} FOR UPDATE`
      } else {
        await tx.$queryRaw`SELECT id FROM production_orders WHERE id = ${probe.productionOrderId!} FOR UPDATE`
      }
      // Klaim dulu: hanya baris yang masih menunggu boleh diputus.
      const claim = await tx.bomRevisionChangeRequest.updateMany({
        where: { id: input.changeRequestId, status: "menunggu" },
        data: {
          status: input.decision === "setujui" ? "disetujui" : "ditolak",
          decidedBy: Number(user.id),
          decidedAt: new Date(),
          decisionReason,
        },
      })
      if (claim.count === 0) return { error: "Pengajuan ini sudah diputuskan." }

      const change = await tx.bomRevisionChangeRequest.findUnique({
        where: { id: input.changeRequestId },
        select: {
          id: true,
          workOrderId: true,
          productionOrderId: true,
          fromRevisionId: true,
          toRevisionId: true,
          requestedBy: true,
          reason: true,
        },
      })
      if (!change) return { error: "Pengajuan ganti revisi BOM tidak ditemukan." }
      // SoD (BR-BOM68-05): penyetuju tidak boleh pengaju yang sama.
      if (change.requestedBy != null && change.requestedBy === Number(user.id)) {
        // Klaim di atas sudah menulis; lempar supaya transaksi rollback.
        throw new Error("Persetujuan tidak boleh oleh pengaju yang sama (pemisahan tugas).")
      }
      if (input.decision === "tolak") {
        return { id: change.id, status: "ditolak", applied: false }
      }

      const ownerId = (owner === "wo" ? change.workOrderId : change.productionOrderId)!
      const doc =
        owner === "wo"
          ? await tx.workOrder.findFirst({
              where: { id: ownerId },
              select: { id: true, documentNo: true, status: true, bomRevisionId: true },
            })
          : await tx.productionOrder.findFirst({
              where: { id: ownerId },
              select: { id: true, documentNo: true, status: true, bomRevisionId: true },
            })
      if (!doc) throw new Error("Dokumen pemilik tidak ditemukan.")
      const closedList = owner === "wo" ? WO_CLOSED : PO_CLOSED
      if (closedList.includes(doc.status)) {
        throw new Error(`Dokumen ${doc.documentNo} sudah ${doc.status}; pin tidak dapat diganti.`)
      }
      if (doc.bomRevisionId !== change.fromRevisionId) {
        throw new Error("Pin revisi dokumen sudah berubah sejak pengajuan dibuat; ajukan ulang dari pin saat ini.")
      }
      // Pin diganti dalam transaksi persetujuan yang sama (BR-BOM68-06).
      if (owner === "wo") {
        await tx.workOrder.update({
          where: { id: ownerId },
          data: { bomRevisionId: change.toRevisionId },
        })
      } else {
        await tx.productionOrder.update({
          where: { id: ownerId },
          data: { bomRevisionId: change.toRevisionId },
        })
      }
      return { id: change.id, status: "disetujui", applied: true, documentNo: doc.documentNo }
    })

    if ("error" in decided) return { success: false, error: String(decided.error) }
    await logActivity(
      "update",
      "BomRevisionChangeRequest",
      decided.id,
      decided.status === "disetujui"
        ? `Menyetujui ganti revisi BOM ${decided.documentNo ?? ""} (pengajuan #${decided.id}): pin diganti dalam persetujuan ini`
        : `Menolak ganti revisi BOM (pengajuan #${decided.id}): ${decisionReason}`,
    )
    revalidatePath("/produksi/work-orders")
    revalidatePath("/produksi/production-orders")
    return { success: true, id: decided.id, status: decided.status }
  } catch (error) {
    if (isNextRedirectError(error)) throw error
    return { success: false, error: getErrorMessage(error) }
  }
}

export async function listBomRevisionChangeRequests(input: {
  workOrderId?: number
  productionOrderId?: number
}): Promise<
  Result<{
    requests: {
      id: number
      fromRevisionId: number
      toRevisionId: number
      reason: string
      status: string
      requestedBy: number | null
      decidedBy: number | null
      decidedAt: Date | null
      decisionReason: string | null
      createdAt: Date
    }[]
  }>
> {
  try {
    const hasWo = input.workOrderId != null
    const hasPo = input.productionOrderId != null
    if (hasWo === hasPo) {
      return { success: false, error: "Tentukan tepat satu dokumen pemilik: perintah kerja atau order produksi." }
    }
    await requirePermission(ownerPermission(hasWo ? "wo" : "po", "lihat"))
    const requests = await prisma.bomRevisionChangeRequest.findMany({
      where: ownerWhere(input),
      select: {
        id: true,
        fromRevisionId: true,
        toRevisionId: true,
        reason: true,
        status: true,
        requestedBy: true,
        decidedBy: true,
        decidedAt: true,
        decisionReason: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    })
    return { success: true, requests }
  } catch (error) {
    if (isNextRedirectError(error)) throw error
    return { success: false, error: getErrorMessage(error) }
  }
}
