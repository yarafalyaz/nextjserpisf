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
 */

export interface MaterialNeedInput {
  itemId: number
  name: string
  unitOfMeasure: string
  requiredQty: number
  qtyOnHand: number
  issuedQty: number
  orderedQty: number
}

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
  /** remainingQty - qtyOnHand > 0: stok belum menutup sisa kebutuhan. */
  shortageQty: number
  isService: boolean
  fulfilled: boolean
}

export interface WorkOrderMaterialNeeds {
  lines: MaterialNeedLine[]
  totalRequired: number
  totalIssued: number
  totalOrdered: number
  lineCount: number
  fulfilledCount: number
  shortageCount: number
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
    const remainingQty = Math.max(0, requiredQty - issuedQty)
    const shortageQty = Math.max(0, remainingQty - qtyOnHand)
    return {
      itemId: input.itemId,
      name: input.name,
      unitOfMeasure: input.unitOfMeasure,
      requiredQty,
      qtyOnHand,
      issuedQty,
      orderedQty,
      remainingQty,
      shortageQty,
      isService,
      fulfilled: isService || remainingQty <= EPSILON,
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
    allFulfilled: lines.every((l) => l.fulfilled),
  }
}
