/**
 * Builder murni Permintaan Barang Antar Gudang — F-2026-10-22-078-S
 * inti (induk F-2026-10-21-014), spec BOT 5 §3/§5 + putusan BOT 1
 * Q-MR-1/2/3 (backlog §8A).
 *
 * Mengikat:
 * - Status permintaan TIDAK ditulis bebas: turunan pemenuhan di sini
 *   dari qty DITERIMA kumulatif per item atas transfer tertaut
 *   berstatus received (BR-MR-04). Transfer lahir/dikirim saja TIDAK
 *   mengubah status (AC-MR-3). Tanpa receivedQty per baris transfer
 *   (F-2026-10-21-015 belum live), satu transfer diterima = seluruh
 *   barisnya diterima penuh; pemenuhan bertahap antar-transfer tetap
 *   menghasilkan terpenuhi_sebagian.
 * - Permintaan bukan dokumen nilai: tanpa harga/biaya/jurnal (BR-MR-12).
 * - Kata status UI di §6 spec diekspor verbatim; UI menempel apa adanya.
 *
 * Pure (tanpa Prisma/DOM). Loader DB: material-request-data.ts.
 * Aksi tulis: src/actions/material-request.actions.ts.
 */

export const MATERIAL_REQUEST_STATUSES = [
  "draft",
  "diajukan",
  "disetujui",
  "ditolak",
  "terpenuhi",
  "terpenuhi_sebagian",
  "ditutup_manual",
  "dibatalkan",
] as const

export type MaterialRequestStatus = (typeof MATERIAL_REQUEST_STATUSES)[number]

/** Kata tampil §6 spec BOT 5 — verbatim untuk BOT 2. */
export const MATERIAL_REQUEST_STATUS_LABELS: Record<MaterialRequestStatus, string> = {
  draft: "Draft",
  diajukan: "Diajukan",
  disetujui: "Disetujui",
  ditolak: "Ditolak",
  terpenuhi: "Terpenuhi",
  terpenuhi_sebagian: "Terpenuhi Sebagian",
  ditutup_manual: "Ditutup Manual",
  dibatalkan: "Dibatalkan",
}

export const MATERIAL_REQUEST_TITLE = "Permintaan Antar Gudang"

const EPSILON = 0.0001

export interface MaterialRequestLineInput {
  itemId: number
  qty: number
}

export interface MaterialRequestReceivedLineInput {
  itemId: number
  qty: number
}

export interface MaterialRequestLineFulfillment {
  itemId: number
  requestedQty: number
  receivedQty: number
  remainingQty: number
}

export type MaterialRequestFulfillmentStatus =
  | "disetujui"
  | "terpenuhi_sebagian"
  | "terpenuhi"

/**
 * Turunan pemenuhan (BR-MR-04): agregasi qty diterima per item dari
 * semua transfer tertaut yang sudah received, lawan qty diminta.
 * Tidak ada yang diterima -> tetap `disetujui`; sebagian -> 
 * `terpenuhi_sebagian`; semua baris penuh -> `terpenuhi`.
 */
export function deriveMaterialRequestFulfillment(input: {
  requested: readonly MaterialRequestLineInput[]
  receivedLines: readonly MaterialRequestReceivedLineInput[]
}): {
  status: MaterialRequestFulfillmentStatus
  lines: MaterialRequestLineFulfillment[]
} {
  const receivedByItem = new Map<number, number>()
  for (const line of input.receivedLines) {
    receivedByItem.set(line.itemId, (receivedByItem.get(line.itemId) ?? 0) + line.qty)
  }

  const lines: MaterialRequestLineFulfillment[] = input.requested.map((line) => {
    const receivedQty = Math.min(receivedByItem.get(line.itemId) ?? 0, line.qty)
    return {
      itemId: line.itemId,
      requestedQty: line.qty,
      receivedQty,
      remainingQty: Math.max(0, line.qty - receivedQty),
    }
  })

  const anyReceived = lines.some((l) => l.receivedQty > EPSILON)
  const allFulfilled =
    lines.length > 0 && lines.every((l) => l.remainingQty <= EPSILON)

  return {
    status: allFulfilled ? "terpenuhi" : anyReceived ? "terpenuhi_sebagian" : "disetujui",
    lines,
  }
}

/** Status tersimpan yang boleh menerima turunan pemenuhan sistem. */
export function isMaterialRequestFulfillable(status: string): boolean {
  return status === "disetujui" || status === "terpenuhi_sebagian"
}

/** Transisi manual yang sah menurut matriks §3 (di luar turunan sistem). */
export const MATERIAL_REQUEST_TRANSITIONS: Record<string, readonly string[]> = {
  draft: ["diajukan", "dibatalkan"],
  diajukan: ["disetujui", "ditolak", "dibatalkan"],
  disetujui: ["ditutup_manual"],
  terpenuhi_sebagian: ["ditutup_manual"],
}

export function canTransitionMaterialRequest(from: string, to: string): boolean {
  return (MATERIAL_REQUEST_TRANSITIONS[from] ?? []).includes(to)
}
