/**
 * Builder murni kebutuhan material per perintah kerja (F-2026-10-20-19).
 *
 * "Sudah keluar" hanya dihitung dari MaterialIssue yang benar-benar keluar:
 * MI non-completed belum menyentuh stok sama sekali — stok keluar dibuat
 * `onMaterialIssueCompleted` persis saat transisi ke `completed`
 * (material-issue.hook.ts), dan hanya MI draft yang bisa dihapus. MI
 * dengan status lain (mis. `cancelled`) tidak pernah mengeluarkan stok,
 * jadi keduanya dikecualikan — kalau ikut dijumlah, "tersisa" terbaca
 * lebih kecil dari kenyataan dan gudang mengira material sudah terkirim.
 *
 * "Dipesan" hanya dari PurchaseOrder non-`cancelled` yang tertaut WO ini
 * (`PurchaseOrder.workOrderId`), bersih sudah-diterima per baris
 * (`qty - receivedQty`). Baris jasa (WorkOrderItem itemId=0, lihat
 * AUD-NEXT-07 di schema) bukan item stok — tanpa kebutuhan stok, selalu
 * terpenuhi supaya tidak menahan kartu kebutuhan.
 *
 * "Tersedia" memakai stok global `Item.qtyOnHand` (konvensi sama seperti
 * laporan stok minimum, min-stock.ts: total seluruh gudang), bukan per
 * gudang — halaman WO tidak mengunci satu gudang material.
 *
 * F-2026-10-20-51(a): "tersedia efektif" mengurangi stok yang sudah
 * terikat kebutuhan WO aktif LAIN (committedOtherQty) supaya stok yang
 * sama tidak tampak cukup untuk dua job sekaligus. Ini peringatan
 * read-only (ATP), BUKAN reservasi mengikat — inti StockReservation
 * (F-07) tetap ditunda.
 * F-2026-10-20-52: incoming = sisa PO tertaut WO ini yang belum diterima,
 * dengan tanggal tercepat; status cakupannya dibandingkan ke startDate WO.
 */

export interface MaterialNeedInput {
  itemId: number
  name: string
  unitOfMeasure: string
  requiredQty: number
  qtyOnHand: number
  issuedQty: number
  orderedQty: number
  /** Sisa kebutuhan WO aktif lain (required−issued, non-replaced) per item. Opsional: pemanggil lama tanpa field ini dianggap 0. */
  committedOtherQty?: number
  /** Sisa PO WO ini belum diterima (qty−receivedQty) per item; default = orderedQty. */
  incomingQty?: number
  /** expectedDate tercepat di antara PO penyumbang incoming; null = tidak ada tanggal. */
  incomingEarliestDate?: Date | null
  /** startDate WO untuk menilai tepat-waktu; null = tidak dinilai (dianggap tepat-waktu). */
  workOrderStartDate?: Date | null
  /**
   * F-2026-10-21-012 lapis aman: stok di gudang yang relevan untuk WO ini
   * (gudang MI completed WO ini + gudang default item). Opsional: pemanggil
   * lama tanpa field ini dianggap sama dengan qtyOnHand global.
   */
  qtyOnHandAtWarehouse?: number
}

export type IncomingCover = "none" | "tepat-waktu" | "terlambat" | "belum-jadwal"

export interface MaterialNeedLine {
  itemId: number
  name: string
  unitOfMeasure: string
  requiredQty: number
  qtyOnHand: number
  issuedQty: number
  orderedQty: number
  /** Yang masih harus keluar: maks(0, required - issued). */
  remainingQty: number
  /** Sisa kebutuhan WO aktif lain atas item ini (ATP read-only, bukan kunci stok). */
  committedOtherQty: number
  /** qtyOnHand − committedOtherQty, dibatasi >= 0. */
  effectiveAvailableQty: number
  /** remainingQty − effectiveAvailableQty > 0: stok efektif belum menutup sisa kebutuhan. */
  shortageQty: number
  /** Sisa PO WO ini belum diterima; = orderedQty bila pemanggil tidak memisahkan. */
  incomingQty: number
  incomingEarliestDate: Date | null
  /** none: incoming tidak menutup shortage; tepat-waktu/terlambat vs startDate; belum-jadwal: incoming menutup tapi tanpa expectedDate. */
  incomingCover: IncomingCover
  isService: boolean
  fulfilled: boolean
  /** Stok di gudang relevan WO (F-012); = qtyOnHand global bila loader lama. */
  qtyOnHandAtWarehouse: number
  /** remainingQty − qtyOnHandAtWarehouse > 0: gudang relevan tak menutup sisa, walau global cukup. */
  warehouseShortageQty: number
}

export interface WorkOrderMaterialNeeds {
  lines: MaterialNeedLine[]
  totalRequired: number
  totalIssued: number
  totalOrdered: number
  lineCount: number
  fulfilledCount: number
  shortageCount: number
  /** Jumlah baris shortage di gudang relevan walau global cukup (F-012). */
  warehouseShortageCount: number
  allFulfilled: boolean
}

const EPSILON = 1e-9

export function buildWorkOrderMaterialNeeds(
  inputs: MaterialNeedInput[],
): WorkOrderMaterialNeeds {
  const lines: MaterialNeedLine[] = inputs.map((input) => {
    const isService = input.itemId <= 0
    const requiredQty = isService ? 0 : input.requiredQty
    const issuedQty = isService ? 0 : input.issuedQty
    const orderedQty = isService ? 0 : input.orderedQty
    const qtyOnHand = isService ? 0 : input.qtyOnHand
    const committedOtherQty = isService ? 0 : Math.max(0, input.committedOtherQty ?? 0)
    const effectiveAvailableQty = Math.max(0, qtyOnHand - committedOtherQty)
    const remainingQty = Math.max(0, requiredQty - issuedQty)
    const shortageQty = Math.max(0, remainingQty - effectiveAvailableQty)
    const incomingQty = isService ? 0 : (input.incomingQty ?? orderedQty)
    const qtyOnHandAtWarehouse = isService ? 0 : Math.max(0, input.qtyOnHandAtWarehouse ?? qtyOnHand)
    const warehouseShortageQty = Math.max(0, remainingQty - qtyOnHandAtWarehouse)
    const incomingEarliestDate = isService ? null : (input.incomingEarliestDate ?? null)
    let incomingCover: IncomingCover = "none"
    if (!isService && shortageQty > EPSILON && incomingQty >= shortageQty - EPSILON) {
      if (incomingEarliestDate == null) {
        incomingCover = "belum-jadwal"
      } else if (input.workOrderStartDate != null && incomingEarliestDate.getTime() > input.workOrderStartDate.getTime()) {
        incomingCover = "terlambat"
      } else {
        incomingCover = "tepat-waktu"
      }
    }
    return {
      itemId: input.itemId,
      name: input.name,
      unitOfMeasure: input.unitOfMeasure,
      requiredQty,
      qtyOnHand,
      issuedQty,
      orderedQty,
      committedOtherQty,
      effectiveAvailableQty,
      remainingQty,
      shortageQty,
      incomingQty,
      incomingEarliestDate,
      incomingCover,
      isService,
      fulfilled: isService || remainingQty <= EPSILON,
      qtyOnHandAtWarehouse,
      warehouseShortageQty,
    }
  })
  return {
    lines,
    totalRequired: lines.reduce((s, l) => s + l.requiredQty, 0),
    totalIssued: lines.reduce((s, l) => s + l.issuedQty, 0),
    totalOrdered: lines.reduce((s, l) => s + l.orderedQty, 0),
    lineCount: lines.length,
    fulfilledCount: lines.filter((l) => l.fulfilled).length,
    shortageCount: lines.filter((l) => l.shortageQty > EPSILON).length,
    warehouseShortageCount: lines.filter((l) => l.warehouseShortageQty > EPSILON).length,
    allFulfilled: lines.every((l) => l.fulfilled),
  }
}
