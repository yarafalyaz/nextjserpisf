"use server"

/**
 * F-2026-10-22-066-S inti (induk F-2026-10-20-103): aksi JobChangeOrder WO.
 * Putusan BOT 1 §5A (Q-CO-1/2/3/5) + vonis BOT 4 F-2026-10-22-066-V (Q-CO-4).
 *
 * Penjaga mengikat:
 * - Izin reuse katalog (Q-CO-3, tanpa key baru): buat=create_work_orders,
 *   edit/kirim/catat=edit_work_orders, terapkan=complete_work_orders.
 * - WO hanya pending/in_progress/completed + wajib quotationId
 *   (Q-CO-1/BR-CO-10); dibaca ulang di tx buat + tx terapkan.
 * - Baris ter-issue (MaterialIssueItem.workOrderItemId, SEMUA status
 *   MaterialIssue — lebih ketat dari guard revisi existing yang hanya
 *   completed) terkunci — dibaca ulang di tx kirim + tx terapkan
 *   (BR-CO-03).
 * - Satu CO aktif per WO (BR-CO-06); nomor urut per WO monoton.
 * - Terapkan SATU tx: klaim kondisional disetujui->diterapkan ->
 *   revisi Quotation.grandTotal lewat computeQuotationTotals server
 *   (client tak kirim angka total — vonis BOT 4 butir 1) + revisi
 *   QuotationHistory + increment revisionNumber -> ubah WorkOrderItem
 *   belum-terpasang -> BARU panggil createDifferenceInvoice /
 *   createRevisionDownCredit existing DI LUAR tx baca-tulis ini
 *   (keduanya membuka tx + kunci baris quotation sendiri; urutan vonis:
 *   setuju -> revisi nilai -> panggil aksi existing). Dokumen CO sendiri
 *   TIDAK membuat jurnal/piutang/payment (BR-CO-02); CO tidak menyentuh
 *   bomRevisionId (Q-CO-5) dan tidak menyentuh ProductionCost (AC-CO-3).
 */

import { getErrorMessage, isNextRedirectError } from "@/lib/utils/error"
import { revalidatePath } from "next/cache"
import { requirePermission } from "@/lib/auth/permissions"
import { prisma, TxClient } from "@/lib/db/prisma"
import { logActivity } from "@/lib/services/activity-log.service"
import { nextSlug } from "@/lib/utils/slug-db"
import {
  computeQuotationTotals,
  createDifferenceInvoice,
  createRevisionDownCredit,
} from "./sales.actions"
import {
  assertChangeOrderTransition,
  assertLinesNotLocked,
  assertWorkOrderEligibleForChangeOrder,
  computeChangeOrderSelisih,
  computeLockedWorkOrderItemIds,
  formatChangeOrderDocumentNo,
  resolveQuotationItemForChange,
  CHANGE_ORDER_ACTIVE_STATUSES,
  type ChangeOrderLineInput,
} from "@/lib/reports/job-change-order"

const REVALIDATE = "/produksi/perintah-kerja"

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}

function num(value: unknown, fallback = 0): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

type Tx = TxClient

async function lockWorkOrderRow(tx: Tx, workOrderId: number): Promise<void> {
  await tx.$queryRaw`SELECT id FROM work_orders WHERE id = ${workOrderId} FOR UPDATE`
}

async function loadWorkOrderForChangeOrder(tx: Tx, workOrderId: number) {
  const wo = await tx.workOrder.findUnique({
    where: { id: workOrderId },
    select: {
      id: true,
      documentNo: true,
      status: true,
      quotationId: true,
      items: {
        select: {
          id: true,
          itemId: true,
          description: true,
          qty: true,
          cost: true,
          status: true,
        },
        orderBy: { id: "asc" },
      },
    },
  })
  if (!wo) throw new Error("Perintah Kerja tidak ditemukan")
  return wo
}

async function loadLockedLineIds(
  tx: Tx,
  workOrderId: number,
  woItems: { id: number; itemId: number }[],
): Promise<Set<number>> {
  // SEMUA status MaterialIssue (lebih ketat dari guard revisi existing
  // yang hanya completed): baris yang sudah pernah jadi baris issue tak
  // boleh diubah CO walau issue-nya belum selesai.
  const issued = await tx.materialIssueItem.findMany({
    where: {
      materialIssue: { workOrderId },
      OR: [
        { workOrderItemId: { in: woItems.map((i) => i.id) } },
        { workOrderItemId: null, itemId: { in: woItems.map((i) => i.itemId) } },
      ],
    },
    select: { workOrderItemId: true, itemId: true },
  })
  return computeLockedWorkOrderItemIds({ workOrderItems: woItems, issuedItems: issued })
}

function normalizeLines(raw: unknown): ChangeOrderLineInput[] {
  if (!Array.isArray(raw)) return []
  return raw.map((r: Record<string, unknown>, idx) => ({
    action: (cleanText(r.action) || "ubah") as ChangeOrderLineInput["action"],
    workOrderItemId: r.workOrderItemId == null ? null : num(r.workOrderItemId),
    itemId: num(r.itemId),
    description: (r.description as string | null) ?? null,
    uom: (r.uom as string | null) ?? null,
    qtyBefore: r.qtyBefore == null ? null : num(r.qtyBefore),
    qtyAfter: r.qtyAfter == null ? null : num(r.qtyAfter),
    costBefore: r.costBefore == null ? null : num(r.costBefore),
    costAfter: r.costAfter == null ? null : num(r.costAfter),
    unitPriceBefore: r.unitPriceBefore == null ? null : num(r.unitPriceBefore),
    unitPriceAfter: r.unitPriceAfter == null ? null : num(r.unitPriceAfter),
    discountBefore: r.discountBefore == null ? null : num(r.discountBefore),
    discountAfter: r.discountAfter == null ? null : num(r.discountAfter),
    discountType: (r.discountType as string | null) ?? null,
    sortOrder: idx,
  })) as ChangeOrderLineInput[]
}

function validateLines(lines: ChangeOrderLineInput[]): void {
  if (lines.length === 0) throw new Error("Change order wajib punya minimal satu baris perubahan")
  for (const line of lines) {
    if (!["tambah", "ubah", "hapus"].includes(line.action)) {
      throw new Error(`Aksi baris change order tidak dikenal: '${line.action}'`)
    }
    if (line.action === "tambah") {
      if (line.workOrderItemId != null) throw new Error("Baris tambah tidak boleh menunjuk baris perintah kerja existing")
      if ((line.qtyAfter ?? 0) <= 0) throw new Error("Qty baris tambah wajib lebih dari 0")
    } else {
      if (line.workOrderItemId == null) throw new Error(`Baris ${line.action} wajib menunjuk baris perintah kerja`)
      if (line.action === "ubah" && (line.qtyAfter ?? 0) <= 0) {
        throw new Error("Qty baris ubah wajib lebih dari 0 — gunakan aksi hapus untuk menghilangkan baris")
      }
    }
  }
}

/** Baris quotation datar untuk pencocokan deterministik CO. */
interface QuoteLineFlat {
  id: number
  itemId: number | null
  unitPrice: number
  description: string | null
}

/**
 * Snapshot baris WO berjalan -> baris CO (before dari server, bukan klien).
 * Untuk ubah/hapus, unitPriceBefore WAJIB hasil resolusi deterministik ke
 * baris quotation (resolveQuotationItemForChange): nol/ambigu = tolak —
 * jangan diam-diam pakai WorkOrderItem.cost sebagai harga tagih.
 */
function snapshotLinesFromWorkOrder(
  woItems: { id: number; itemId: number; description: string | null; qty: unknown; cost: unknown }[],
  requested: ChangeOrderLineInput[],
  quoteLines: QuoteLineFlat[],
): ChangeOrderLineInput[] {
  const byId = new Map(woItems.map((i) => [i.id, i]))
  return requested.map((line, idx) => {
    if (line.action === "tambah") return { ...line, sortOrder: idx } as ChangeOrderLineInput
    const woItem = line.workOrderItemId != null ? byId.get(line.workOrderItemId) : undefined
    if (!woItem) throw new Error(`Baris perintah kerja #${line.workOrderItemId} tidak ditemukan pada Perintah Kerja ini`)
    const resolved = resolveQuotationItemForChange(quoteLines, {
      itemId: woItem.itemId,
      unitPriceBefore: line.unitPriceBefore ?? Number(woItem.cost),
      description: line.description ?? woItem.description,
    })
    if (resolved.ambiguous || !resolved.item) {
      throw new Error(
        `Baris penawaran untuk item #${woItem.itemId} pada baris perintah kerja #${woItem.id} tidak dapat dicocokkan secara unik — penawaran berubah atau memuat baris ganda; periksa penawaran sebelum membuat change order.`,
      )
    }
    return {
      ...line,
      itemId: woItem.itemId,
      description: line.description ?? woItem.description,
      qtyBefore: Number(woItem.qty),
      costBefore: Number(woItem.cost),
      unitPriceBefore: Number(resolved.item.unitPrice),
      sortOrder: idx,
    } as ChangeOrderLineInput
  })
}

async function loadQuoteLinesFlat(tx: Tx, quotationId: number): Promise<QuoteLineFlat[]> {
  const sections = await tx.quotationSection.findMany({
    where: { quotationId },
    orderBy: { sortOrder: "asc" },
    select: {
      items: {
        orderBy: { sortOrder: "asc" },
        select: { id: true, itemId: true, unitPrice: true, description: true },
      },
    },
  })
  return sections.flatMap((s) =>
    s.items.map((it) => ({
      id: it.id,
      itemId: it.itemId,
      unitPrice: Number(it.unitPrice),
      description: it.description,
    })),
  )
}

export async function createJobChangeOrder(input: {
  workOrderId: number
  reason: string
  lines: ChangeOrderLineInput[]
}) {
  try {
    const user = await requirePermission("create_work_orders")
    const workOrderId = num(input?.workOrderId)
    const reason = cleanText(input?.reason)
    if (!workOrderId) return { success: false, error: "Perintah Kerja wajib dipilih" }
    if (!reason) return { success: false, error: "Alasan perubahan wajib diisi" }
    const requested = normalizeLines(input?.lines)
    validateLines(requested)

    const created = await prisma.$transaction(async (tx) => {
      await lockWorkOrderRow(tx, workOrderId)
      const wo = await loadWorkOrderForChangeOrder(tx, workOrderId)
      assertWorkOrderEligibleForChangeOrder({ workOrderStatus: wo.status, quotationId: wo.quotationId })

      const active = await tx.jobChangeOrder.findFirst({
        where: { workOrderId, status: { in: CHANGE_ORDER_ACTIVE_STATUSES } },
        select: { id: true, documentNo: true, status: true },
      })
      if (active) {
        throw new Error(
          `Masih ada change order aktif ${active.documentNo} (status ${active.status}) untuk Perintah Kerja ini — selesaikan atau batalkan dulu (BR-CO-06).`,
        )
      }

      const locked = await loadLockedLineIds(tx, workOrderId, wo.items)
      assertLinesNotLocked(requested, locked)
      const quoteLines = await loadQuoteLinesFlat(tx, wo.quotationId as number)
      const lines = snapshotLinesFromWorkOrder(wo.items, requested, quoteLines)

      const last = await tx.jobChangeOrder.findFirst({
        where: { workOrderId },
        orderBy: { sequence: "desc" },
        select: { sequence: true },
      })
      const sequence = (last?.sequence ?? 0) + 1
      const documentNo = formatChangeOrderDocumentNo(wo.documentNo, sequence)
      const slug = await nextSlug("jobChangeOrder", documentNo)

      return tx.jobChangeOrder.create({
        data: {
          documentNo,
          slug,
          sequence,
          workOrderId,
          quotationId: wo.quotationId as number,
          status: "draft",
          reason,
          createdBy: Number(user.id),
          items: {
            create: lines.map((l, idx) => ({
              workOrderItemId: l.workOrderItemId,
              itemId: l.itemId,
              action: l.action,
              description: l.description ?? null,
              uom: l.uom ?? null,
              qtyBefore: l.qtyBefore,
              qtyAfter: l.qtyAfter,
              costBefore: l.costBefore,
              costAfter: l.costAfter,
              unitPriceBefore: l.unitPriceBefore,
              unitPriceAfter: l.unitPriceAfter,
              discountBefore: l.discountBefore,
              discountAfter: l.discountAfter,
              discountType: l.discountType ?? null,
              sortOrder: idx,
            })),
          },
        },
        select: { id: true, documentNo: true, slug: true },
      })
    })

    await logActivity("create", "JobChangeOrder", created.id, `Membuat change order ${created.documentNo} untuk perintah kerja #${workOrderId}`)
    revalidatePath(REVALIDATE)
    return { success: true, id: created.id, documentNo: created.documentNo, slug: created.slug }
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[createJobChangeOrder]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

export async function updateJobChangeOrderLines(input: {
  changeOrderId: number
  reason?: string
  lines: ChangeOrderLineInput[]
}) {
  try {
    await requirePermission("edit_work_orders")
    const changeOrderId = num(input?.changeOrderId)
    const requested = normalizeLines(input?.lines)
    validateLines(requested)

    await prisma.$transaction(async (tx) => {
      const co = await tx.jobChangeOrder.findUnique({
        where: { id: changeOrderId },
        select: { id: true, workOrderId: true, quotationId: true, status: true },
      })
      if (!co) throw new Error("Change order tidak ditemukan")
      if (co.status !== "draft") {
        throw new Error(`Baris change order hanya bisa diubah saat status draft. Status saat ini '${co.status}'.`)
      }
      await lockWorkOrderRow(tx, co.workOrderId)
      const wo = await loadWorkOrderForChangeOrder(tx, co.workOrderId)
      const locked = await loadLockedLineIds(tx, co.workOrderId, wo.items)
      assertLinesNotLocked(requested, locked)
      const quoteLines = await loadQuoteLinesFlat(tx, co.quotationId)
      const lines = snapshotLinesFromWorkOrder(wo.items, requested, quoteLines)

      await tx.jobChangeOrderItem.deleteMany({ where: { changeOrderId } })
      await tx.jobChangeOrderItem.createMany({
        data: lines.map((l, idx) => ({
          changeOrderId,
          workOrderItemId: l.workOrderItemId,
          itemId: l.itemId,
          action: l.action,
          description: l.description ?? null,
          uom: l.uom ?? null,
          qtyBefore: l.qtyBefore,
          qtyAfter: l.qtyAfter,
          costBefore: l.costBefore,
          costAfter: l.costAfter,
          unitPriceBefore: l.unitPriceBefore,
          unitPriceAfter: l.unitPriceAfter,
          discountBefore: l.discountBefore,
          discountAfter: l.discountAfter,
          discountType: l.discountType ?? null,
          sortOrder: idx,
        })),
      })
      if (input?.reason !== undefined) {
        const reason = cleanText(input.reason)
        if (!reason) throw new Error("Alasan perubahan wajib diisi")
        await tx.jobChangeOrder.update({ where: { id: changeOrderId }, data: { reason } })
      }
    })

    revalidatePath(REVALIDATE)
    return { success: true }
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[updateJobChangeOrderLines]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

export async function sendJobChangeOrder(changeOrderId: number) {
  try {
    const user = await requirePermission("edit_work_orders")
    const id = num(changeOrderId)

    const sent = await prisma.$transaction(async (tx) => {
      const co = await tx.jobChangeOrder.findUnique({
        where: { id },
        include: { items: { orderBy: { sortOrder: "asc" } } },
      })
      if (!co) throw new Error("Change order tidak ditemukan")
      assertChangeOrderTransition(co.status, "menunggu_pelanggan")
      if (!cleanText(co.reason)) throw new Error("Alasan perubahan wajib diisi sebelum dikirim")
      if (co.items.length === 0) throw new Error("Change order belum punya baris perubahan")

      await lockWorkOrderRow(tx, co.workOrderId)
      const wo = await loadWorkOrderForChangeOrder(tx, co.workOrderId)
      assertWorkOrderEligibleForChangeOrder({ workOrderStatus: wo.status, quotationId: wo.quotationId })
      const locked = await loadLockedLineIds(tx, co.workOrderId, wo.items)
      assertLinesNotLocked(co.items as unknown as ChangeOrderLineInput[], locked)

      const quotation = await tx.quotation.findFirst({
        where: { id: co.quotationId, deletedAt: null },
        select: { grandTotal: true },
      })
      if (!quotation) throw new Error("Penawaran tertaut tidak ditemukan atau sudah dihapus")

      const selisih = computeChangeOrderSelisih(co.items as unknown as ChangeOrderLineInput[])
      const grandTotalSebelum = Number(quotation.grandTotal)
      const claim = await tx.jobChangeOrder.updateMany({
        where: { id, status: "draft" },
        data: {
          status: "menunggu_pelanggan",
          sentAt: new Date(),
          sentBy: Number(user.id),
          selisihNilai: selisih,
          grandTotalSebelum,
          grandTotalSesudah: Math.round((grandTotalSebelum + selisih) * 100) / 100,
        },
      })
      if (claim.count === 0) throw new Error("Status change order sudah berubah; muat ulang halaman.")
      return { documentNo: co.documentNo }
    })

    await logActivity("update", "JobChangeOrder", id, `Mengirim change order ${sent.documentNo} ke pelanggan`)
    revalidatePath(REVALIDATE)
    return { success: true }
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[sendJobChangeOrder]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

export async function recordJobChangeOrderApproval(input: {
  changeOrderId: number
  approved: boolean
  approvalReference?: string
  approvalAttachmentUrl?: string
  rejectionReason?: string
}) {
  try {
    const user = await requirePermission("edit_work_orders")
    const id = num(input?.changeOrderId)

    await prisma.$transaction(async (tx) => {
      const co = await tx.jobChangeOrder.findUnique({ where: { id }, select: { id: true, status: true, documentNo: true } })
      if (!co) throw new Error("Change order tidak ditemukan")

      if (input.approved) {
        assertChangeOrderTransition(co.status, "disetujui")
        const reference = cleanText(input.approvalReference)
        // Q-CO-2/BR-CO-07: bukti referensi bebas WAJIB non-kosong.
        if (!reference) throw new Error("Referensi bukti persetujuan pelanggan wajib diisi (nomor chat WA/tanggal persetujuan/nomor surat).")
        const claim = await tx.jobChangeOrder.updateMany({
          where: { id, status: "menunggu_pelanggan" },
          data: {
            status: "disetujui",
            approvalReference: reference,
            approvalAttachmentUrl: cleanText(input.approvalAttachmentUrl) || null,
            disetujuiOlehPelangganAt: new Date(),
            disetujuiDicatatOleh: Number(user.id),
          },
        })
        if (claim.count === 0) throw new Error("Status change order sudah berubah; muat ulang halaman.")
      } else {
        assertChangeOrderTransition(co.status, "ditolak")
        const reason = cleanText(input.rejectionReason)
        if (!reason) throw new Error("Alasan penolakan wajib diisi")
        const claim = await tx.jobChangeOrder.updateMany({
          where: { id, status: "menunggu_pelanggan" },
          data: { status: "ditolak", rejectionReason: reason, rejectedAt: new Date(), rejectedBy: Number(user.id) },
        })
        if (claim.count === 0) throw new Error("Status change order sudah berubah; muat ulang halaman.")
      }
    })

    await logActivity("update", "JobChangeOrder", id, input.approved ? "Mencatat persetujuan pelanggan change order (dicatat staf)" : "Mencatat penolakan pelanggan change order")
    revalidatePath(REVALIDATE)
    return { success: true }
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[recordJobChangeOrderApproval]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

export async function cancelJobChangeOrder(input: { changeOrderId: number; reason: string }) {
  try {
    const user = await requirePermission("edit_work_orders")
    const id = num(input?.changeOrderId)
    const reason = cleanText(input?.reason)
    if (!reason) return { success: false, error: "Alasan pembatalan wajib diisi" }

    await prisma.$transaction(async (tx) => {
      const co = await tx.jobChangeOrder.findUnique({ where: { id }, select: { id: true, status: true } })
      if (!co) throw new Error("Change order tidak ditemukan")
      assertChangeOrderTransition(co.status, "dibatalkan")
      const claim = await tx.jobChangeOrder.updateMany({
        where: { id, status: { in: ["draft", "menunggu_pelanggan"] } },
        data: { status: "dibatalkan", cancelReason: reason, cancelledAt: new Date(), cancelledBy: Number(user.id) },
      })
      if (claim.count === 0) throw new Error("Status change order sudah berubah; muat ulang halaman.")
    })

    await logActivity("update", "JobChangeOrder", id, `Membatalkan change order: ${reason}`)
    revalidatePath(REVALIDATE)
    return { success: true }
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[cancelJobChangeOrder]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

/** Total baris quotation untuk persist (pola computeQuotationLine existing). */
function computeLineTotalForPersist(q: { qty: number; unitPrice: number; discount: number }): number {
  const qty = Math.max(0.01, Number(q.qty) || 0)
  const lineSubtotal = qty * (Number(q.unitPrice) || 0)
  return Math.max(0, Math.round((lineSubtotal - (Number(q.discount) || 0)) * 100) / 100)
}

/**
 * Terapkan CO disetujui. Satu tx baca-tulis: (1) klaim atomik
 * disetujui->diterapkan, (2) kunci baris WO+quotation, (3) kunci baris
 * ter-issue dibaca ulang, (4) hitung ulang grandTotal lewat
 * computeQuotationTotals existing, (5) snapshot QuotationHistory,
 * (6) tulis baris quotation, (7) ubah WorkOrderItem belum-terpasang.
 * Dokumen uang lahir
 * SESUDAH tx ini commit lewat aksi existing (urutan vonis BOT 4);
 * kegagalan dokumen uang tidak menggulung nilai kontrak — CO mencatat
 * appliedNote dan aksi existing aman dipanggil ulang (kandidat
 * builder menolak selisih 0/dobel).
 */
export async function applyJobChangeOrder(changeOrderId: number) {
  try {
    const user = await requirePermission("complete_work_orders")
    const id = num(changeOrderId)

    const applied = await prisma.$transaction(async (tx) => {
      // (1) Klaim atomik PALING AWAL: hanya pemenang disetujui->diterapkan
      // yang lanjut. P2002/idempoten apply dilindungi klaim ini + status.
      const claim = await tx.jobChangeOrder.updateMany({
        where: { id, status: "disetujui" },
        data: { status: "diterapkan", appliedAt: new Date(), appliedBy: Number(user.id) },
      })
      if (claim.count === 0) {
        const existing = await tx.jobChangeOrder.findUnique({
          where: { id },
          select: { status: true },
        })
        if (!existing) throw new Error("Change order tidak ditemukan")
        throw new Error(
          `Change order hanya dapat diterapkan dari status disetujui. Status saat ini '${existing.status}'.`,
        )
      }

      const co = await tx.jobChangeOrder.findUnique({
        where: { id },
        include: { items: { orderBy: { sortOrder: "asc" } } },
      })
      if (!co) throw new Error("Change order tidak ditemukan")

      // (2) Kunci baris WO + quotation (hindari revisi quotation lain
      // menyela antara baca grandTotal dan tulis grandTotal baru).
      await lockWorkOrderRow(tx, co.workOrderId)
      await tx.$queryRaw`SELECT id FROM quotations WHERE id = ${co.quotationId} FOR UPDATE`

      const wo = await loadWorkOrderForChangeOrder(tx, co.workOrderId)
      // Q-CO-1 dibaca ulang di tx terapkan (WO di-close di antara
      // setuju->terapkan = terapkan ditolak, spec §6).
      assertWorkOrderEligibleForChangeOrder({ workOrderStatus: wo.status, quotationId: wo.quotationId })
      if (wo.quotationId !== co.quotationId) throw new Error("Penawaran tertaut Perintah Kerja berubah; change order tidak dapat diterapkan.")

      // (3) Kunci baris dibaca ulang di tx terapkan (BR-CO-03).
      const locked = await loadLockedLineIds(tx, co.workOrderId, wo.items)
      assertLinesNotLocked(co.items as unknown as ChangeOrderLineInput[], locked)

      const quotation = await tx.quotation.findFirst({
        where: { id: co.quotationId, deletedAt: null },
        include: { sections: { include: { items: true }, orderBy: { sortOrder: "asc" } } },
      })
      if (!quotation) throw new Error("Penawaran tertaut tidak ditemukan atau sudah dihapus")

      // Terapkan baris ke quotation di MEMORI dulu (belum tulis DB):
      // pencocokan deterministik per baris CO; nol/ambigu = batal semua.
      interface QItemMut {
        id: number
        sectionId: number
        itemId: number | null
        description: string | null
        uom: string | null
        qty: number
        unitPrice: number
        discount: number
        sortOrder: number
        isNew: boolean
        isDeleted: boolean
      }
      const qItems: QItemMut[] = []
      for (const s of quotation.sections) {
        for (const it of s.items) {
          qItems.push({
            id: it.id,
            sectionId: s.id,
            itemId: it.itemId,
            description: it.description,
            uom: it.uom,
            qty: Number(it.qty),
            unitPrice: Number(it.unitPrice),
            discount: Number(it.discount),
            sortOrder: it.sortOrder,
            isNew: false,
            isDeleted: false,
          })
        }
      }
      const flatForResolve = qItems.map((q) => ({
        id: q.id,
        itemId: q.itemId,
        unitPrice: q.unitPrice,
        description: q.description,
      }))

      for (const line of co.items) {
        if (line.action === "tambah") {
          const firstSection = quotation.sections[0]
          if (!firstSection) throw new Error("Penawaran tidak punya section untuk baris tambah change order")
          qItems.push({
            id: -1,
            sectionId: firstSection.id,
            itemId: line.itemId > 0 ? line.itemId : null,
            description: line.description,
            uom: line.uom,
            qty: Number(line.qtyAfter),
            unitPrice: Number(line.unitPriceAfter),
            discount: Number(line.discountAfter ?? 0),
            sortOrder: qItems.filter((q) => q.sectionId === firstSection.id).length,
            isNew: true,
            isDeleted: false,
          })
        } else {
          const resolved = resolveQuotationItemForChange(flatForResolve, {
            itemId: line.itemId,
            unitPriceBefore: line.unitPriceBefore == null ? null : Number(line.unitPriceBefore),
            description: line.description,
          })
          if (resolved.ambiguous || !resolved.item) {
            throw new Error(
              `Baris penawaran untuk item #${line.itemId} tidak dapat dicocokkan secara unik untuk diterapkan — penawaran berubah sejak change order dibuat; batalkan dan buat change order baru.`,
            )
          }
          const target = qItems.find((q) => q.id === resolved.item!.id)
          if (!target) throw new Error("Baris penawaran hasil pencocokan hilang; muat ulang.")
          if (line.action === "hapus") {
            target.isDeleted = true
            target.qty = 0
          } else {
            target.qty = Number(line.qtyAfter)
            target.unitPrice = Number(line.unitPriceAfter)
            target.discount = Number(line.discountAfter ?? target.discount)
            if (line.description) target.description = line.description
          }
        }
      }

      // (4) Hitung ulang server lewat computeQuotationTotals EXISTING
      // (vonis BOT 4 butir 1 — BUKAN replikasi rumus di sini). Bentuk
      // sections dipertahankan supaya clamp diskon persen per baris
      // (computeQuotationLine: qty min 0.01, persen clamp 100) identik
      // jalur create/update quotation. discountType quotation tak
      // disimpan per baris; discount tersimpan = nominal, jadi teruskan
      // apa adanya (tanpa discountType) seperti perilaku simpan ulang.
      const sectionsForTotals = quotation.sections.map((s) => ({
        name: s.name,
        items: qItems
          .filter((q) => q.sectionId === s.id && !q.isDeleted)
          .map((q) => ({
            qty: q.qty,
            unitPrice: q.unitPrice,
            discount: q.discount,
          })),
      }))
      const totals = computeQuotationTotals({
        sections: sectionsForTotals,
        discount: Number(quotation.discount),
        tax: Number(quotation.tax),
      })

      // (5) Snapshot histori SEBELUM ubah (pola reviseQuotation existing).
      await tx.quotationHistory.create({
        data: {
          quotationId: quotation.id,
          revisionNumber: quotation.revisionNumber,
          statusAtSnapshot: quotation.status,
          dataSnapshot: {
            grandTotal: quotation.grandTotal,
            subtotal: quotation.subtotal,
            discount: quotation.discount,
            tax: quotation.tax,
            sections: quotation.sections,
            changeOrderId: co.id,
            changeOrderDocumentNo: co.documentNo,
          } as never,
          changeReason: `Change order ${co.documentNo}: ${co.reason}`,
          action: "change_order_applied",
          description: `Change order ${co.documentNo} diterapkan pada perintah kerja — nilai kontrak direvisi`,
          userId: Number(user.id),
        },
      })

      // (6) Tulis baris quotation hasil terapan.
      for (const q of qItems) {
        if (q.isNew) {
          const lineTotal = computeLineTotalForPersist(q)
          await tx.quotationItem.create({
            data: {
              sectionId: q.sectionId,
              itemId: q.itemId,
              description: q.description,
              uom: q.uom,
              qty: q.qty,
              unitPrice: q.unitPrice,
              discount: q.discount,
              total: lineTotal,
              sortOrder: q.sortOrder,
            },
          })
        } else if (q.isDeleted) {
          await tx.quotationItem.delete({ where: { id: q.id } })
        } else {
          await tx.quotationItem.update({
            where: { id: q.id },
            data: {
              qty: q.qty,
              unitPrice: q.unitPrice,
              discount: q.discount,
              total: computeLineTotalForPersist(q),
              ...(q.description !== undefined ? { description: q.description } : {}),
            },
          })
        }
      }

      await tx.quotation.update({
        where: { id: quotation.id },
        data: {
          subtotal: totals.computedSubtotal,
          discount: totals.headerDiscount,
          tax: totals.headerTax,
          grandTotal: totals.computedGrandTotal,
          revisionNumber: { increment: 1 },
        },
      })

      // (7) Ubah WorkOrderItem belum-terpasang (Q-CO-5: bomRevisionId
      // TIDAK disentuh; ProductionCost TIDAK disentuh — AC-CO-3).
      for (const line of co.items) {
        if (line.action === "tambah") {
          const created = await tx.workOrderItem.create({
            data: {
              workOrderId: co.workOrderId,
              itemId: line.itemId,
              description: line.description,
              qty: line.qtyAfter as never,
              cost: (line.costAfter ?? line.unitPriceAfter ?? 0) as never,
              status: "pending",
            },
            select: { id: true },
          })
          await tx.jobChangeOrderItem.update({
            where: { id: line.id },
            data: { workOrderItemId: created.id },
          })
        } else if (line.action === "ubah") {
          await tx.workOrderItem.update({
            where: { id: line.workOrderItemId as number },
            data: {
              qty: line.qtyAfter as never,
              cost: (line.costAfter ?? line.unitPriceAfter ?? 0) as never,
              ...(line.description ? { description: line.description } : {}),
            },
          })
        } else {
          // hapus lunak: status replaced (BR-CO-04 jejak audit), bukan hard-delete.
          await tx.workOrderItem.update({
            where: { id: line.workOrderItemId as number },
            data: { status: "replaced" },
          })
        }
      }

      // (8) Lengkapi jejak terapkan pada baris CO (status sudah diklaim
      // di langkah 1; di sini grandTotal final dari hitung ulang server).
      await tx.jobChangeOrder.update({
        where: { id },
        data: { appliedGrandTotal: totals.computedGrandTotal },
      })

      return { quotationId: co.quotationId, documentNo: co.documentNo, newGrandTotal: totals.computedGrandTotal }
    })

    // Uang keluar HANYA lewat aksi existing (BR-CO-02/vonis BOT 4):
    // naik -> faktur selisih draft; turun -> kredit RevisionDown pasif.
    // Selisih 0 -> tanpa dokumen uang + catatan (spec §6, bukan error).
    let moneyNote = "Nilai kontrak tidak berubah — tanpa faktur selisih/kredit."
    let invoiceId: number | null = null
    let creditId: number | null = null
    const diffResult = await createDifferenceInvoice(applied.quotationId)
    if (diffResult.success) {
      invoiceId = diffResult.id ?? null
      moneyNote = `Faktur selisih draft #${invoiceId} dibuat lewat jalur existing.`
    } else {
      const creditResult = await createRevisionDownCredit(applied.quotationId)
      if (creditResult.success) {
        creditId = creditResult.id ?? null
        moneyNote = `Kredit revisi-turun pasif #${creditId} dibuat lewat jalur existing (tanpa jurnal sampai alokasi/refund).`
      } else if (
        !/belum pernah direvisi|Tidak ada selisih|Tidak ada kredit|tidak ada revisi-turun/i.test(
          `${diffResult.error ?? ""} ${creditResult.error ?? ""}`,
        )
      ) {
        moneyNote = `Nilai kontrak sudah direvisi; dokumen uang belum lahir: ${diffResult.error ?? creditResult.error ?? "—"} Panggil ulang faktur selisih/kredit revisi-turun dari penawaran.`
      }
    }

    await prisma.jobChangeOrder.update({
      where: { id },
      data: { appliedInvoiceId: invoiceId, appliedCreditId: creditId, appliedNote: moneyNote },
    })

    await logActivity("update", "JobChangeOrder", id, `Menerapkan change order ${applied.documentNo}: grandTotal penawaran menjadi ${applied.newGrandTotal}. ${moneyNote}`)
    revalidatePath(REVALIDATE)
    revalidatePath("/penjualan/penawaran")
    revalidatePath("/penjualan/faktur")
    return { success: true, invoiceId, creditId, note: moneyNote }
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[applyJobChangeOrder]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

export async function getJobChangeOrdersForWorkOrder(workOrderId: number) {
  await requirePermission("view_work_orders")
  const rows = await prisma.jobChangeOrder.findMany({
    where: { workOrderId: num(workOrderId) },
    include: { items: { orderBy: { sortOrder: "asc" } } },
    orderBy: { sequence: "asc" },
  })
  return rows.map((co) => ({
    id: co.id,
    slug: co.slug,
    documentNo: co.documentNo,
    sequence: co.sequence,
    status: co.status,
    reason: co.reason,
    selisihNilai: co.selisihNilai == null ? null : Number(co.selisihNilai),
    grandTotalSebelum: co.grandTotalSebelum == null ? null : Number(co.grandTotalSebelum),
    grandTotalSesudah: co.grandTotalSesudah == null ? null : Number(co.grandTotalSesudah),
    approvalReference: co.approvalReference,
    disetujuiOlehPelangganAt: co.disetujuiOlehPelangganAt,
    appliedAt: co.appliedAt,
    appliedGrandTotal: co.appliedGrandTotal == null ? null : Number(co.appliedGrandTotal),
    appliedInvoiceId: co.appliedInvoiceId,
    appliedCreditId: co.appliedCreditId,
    appliedNote: co.appliedNote,
    items: co.items.map((it) => ({
      id: it.id,
      workOrderItemId: it.workOrderItemId,
      itemId: it.itemId,
      action: it.action,
      description: it.description,
      qtyBefore: it.qtyBefore == null ? null : Number(it.qtyBefore),
      qtyAfter: it.qtyAfter == null ? null : Number(it.qtyAfter),
      costBefore: it.costBefore == null ? null : Number(it.costBefore),
      costAfter: it.costAfter == null ? null : Number(it.costAfter),
      unitPriceBefore: it.unitPriceBefore == null ? null : Number(it.unitPriceBefore),
      unitPriceAfter: it.unitPriceAfter == null ? null : Number(it.unitPriceAfter),
    })),
  }))
}
