import { prisma, TxClient } from "@/lib/db/prisma"
import { safeRound } from "@/lib/utils/math"

/**
 * F-2026-10-21-009-V (vonis BOT 4, PR #349): tutup job (job close-out).
 *
 * `completed` != `closed`: completed = milestone operasional existing;
 * closed = kunci akuntansi BARU. Transisi sah hanya completed -> closed,
 * reopen closed -> completed. Tutup BUKAN event posting: dilarang jurnal
 * buang-WIP/disposisi saat close — PO sah tutup wajib totalActualCost
 * sudah 0,00 (final release existing), sisa != 0 ditolak menyebut nominal.
 * Tanpa ambang materialitas. Guard biaya terpusat di sini; semua jalur
 * biaya (ProductionCost create/update/delete, pull timesheet, overhead,
 * sync PO jasa, sync rework, MaterialIssue create/complete, MI-from-WO,
 * issueMaterial) memanggil assertJobCostMutable di dalam tx.
 *
 * ponytail: guard dibaca ulang per jalur (2 query kecil) tanpa lock baris
 * job — mutasi biaya existing sudah mengunci baris PO/WO masing-masing;
 * naikkan ke FOR UPDATE gabungan hanya bila ada bukti race tutup-vs-biaya.
 */

type Client = TxClient | typeof prisma

export const JOB_CLOSEOUT_MSG = {
  workOrderClosed: (verb: string) =>
    `Biaya tidak dapat ${verb}: perintah kerja sudah ditutup (closed). Buka kembali (reopen) dengan alasan untuk mengubah biaya.`,
  productionOrderClosed: (verb: string) =>
    `Biaya tidak dapat ${verb}: perintah produksi sudah ditutup (closed). Buka kembali (reopen) dengan alasan untuk mengubah biaya.`,
} as const

/**
 * Penjaga biaya terpusat F-009. Melempar Error Bahasa Indonesia bila job
 * tertutup: PO closed membekukan PO itu; WO closed membekukan WO + semua
 * PO di bawahnya (dua arah rantai). Status completed/cancelled tetap
 * diurus guard existing (mutableOrderError dkk) — fungsi ini hanya closed.
 */
export async function assertJobCostMutable(
  target: { workOrderId?: number | null; productionOrderId?: number | null },
  verb: string,
  client: Client = prisma,
): Promise<void> {
  let workOrderId = target.workOrderId ?? null
  if (target.productionOrderId != null) {
    const order = await client.productionOrder.findUnique({
      where: { id: target.productionOrderId },
      select: { status: true, workOrderId: true },
    })
    if (order?.status === "closed") {
      throw new Error(JOB_CLOSEOUT_MSG.productionOrderClosed(verb))
    }
    if (workOrderId == null) workOrderId = order?.workOrderId ?? null
  }
  if (workOrderId != null) {
    const wo = await client.workOrder.findUnique({
      where: { id: workOrderId },
      select: { status: true },
    })
    if (wo?.status === "closed") {
      throw new Error(JOB_CLOSEOUT_MSG.workOrderClosed(verb))
    }
  }
}

export type CloseoutBlocker = { ok: true } | { ok: false; error: string }

/** Syarat tutup PO (Keputusan 2b+3): completedQty==qty + sisa WIP 0,00. */
export function productionOrderCloseBlocker(order: {
  status: string
  qty: unknown
  completedQty: unknown
  totalActualCost: unknown
}): CloseoutBlocker {
  if (order.status !== "completed") {
    return { ok: false, error: `Perintah produksi hanya dapat ditutup dari status 'completed' (saat ini '${order.status}').` }
  }
  if (Number(order.completedQty) < Number(order.qty)) {
    return {
      ok: false,
      error: `Perintah produksi belum selesai penuh: completedQty ${Number(order.completedQty)} dari qty ${Number(order.qty)}. Selesaikan final terlebih dahulu.`,
    }
  }
  const sisa = safeRound(Number(order.totalActualCost), 2)
  if (sisa !== 0) {
    return {
      ok: false,
      error: `Perintah produksi tidak dapat ditutup: sisa WIP totalActualCost Rp${sisa.toFixed(2)} belum nol. Selesaikan lewat complete final atau koreksi dokumen sumbernya — tutup tidak membuat jurnal buang WIP.`,
    }
  }
  return { ok: true }
}

export function validateCloseReason(reason: string | null | undefined): string | { error: string } {
  const trimmed = (reason ?? "").trim()
  if (!trimmed) return { error: "Alasan penutupan wajib diisi." }
  return trimmed
}

export function validateReopenReason(reason: string | null | undefined): string | { error: string } {
  const trimmed = (reason ?? "").trim()
  if (!trimmed) return { error: "Alasan reopen wajib diisi (tidak boleh kosong/spasi)." }
  return trimmed
}
