/**
 * Builder murni JobChangeOrder (F-2026-10-22-066-S inti, induk
 * F-2026-10-20-103; putusan BOT 1 §5A + vonis BOT 4 F-2026-10-22-066-V).
 *
 * Tanpa Prisma/DB: hanya aturan status, kunci baris ter-issue, dan
 * hitung selisih dari baris CO. Aksi server (job-change-order.actions)
 * memakai builder ini supaya falsifikasi BOT 6 (AC-CO-9) bisa cabut
 * penjaga di satu tempat.
 *
 * Aturan mengikat:
 * - Status: draft -> menunggu_pelanggan -> disetujui -> diterapkan;
 *   ditolak hanya dari menunggu_pelanggan; dibatalkan dari draft/
 *   menunggu_pelanggan. Terminal: ditolak/dibatalkan/diterapkan.
 * - WO boleh CO hanya pending/in_progress/completed (Q-CO-1); WO tanpa
 *   quotationId ditolak (BR-CO-10).
 * - Baris WO dengan MaterialIssueItem (workOrderItemId terisi) pada
 *   MaterialIssue status APA PUN (BR-CO-03, lebih ketat dari guard
 *   revisi existing yang hanya completed) — terkunci total.
 * - Selisih = nilai baris sesudah - sebelum (sen, 2 desimal). Nilai
 *   kontrak tunggal tetap Quotation.grandTotal (BR-CO-01); selisih di
 *   sini hanya informasi persetujuan, BUKAN dasar jurnal (BR-CO-02).
 */

export const JOB_CHANGE_ORDER_STATUSES = [
  "draft",
  "menunggu_pelanggan",
  "disetujui",
  "ditolak",
  "diterapkan",
  "dibatalkan",
] as const

export type JobChangeOrderStatus = (typeof JOB_CHANGE_ORDER_STATUSES)[number]

export const JOB_CHANGE_ORDER_STATUS_LABELS: Record<JobChangeOrderStatus, string> = {
  draft: "Draf",
  menunggu_pelanggan: "Menunggu Pelanggan",
  disetujui: "Disetujui",
  ditolak: "Ditolak",
  diterapkan: "Diterapkan",
  dibatalkan: "Dibatalkan",
}

/** Status WO yang boleh dibuka CO-nya (Q-CO-1 BOT 1). */
export const CHANGE_ORDER_ALLOWED_WORK_ORDER_STATUSES = [
  "pending",
  "in_progress",
  "completed",
] as const

/** Status CO yang masih aktif (satu per WO, BR-CO-06). */
export const CHANGE_ORDER_ACTIVE_STATUSES: JobChangeOrderStatus[] = [
  "draft",
  "menunggu_pelanggan",
  "disetujui",
]

export type ChangeOrderAction = "tambah" | "ubah" | "hapus"

export interface ChangeOrderLineInput {
  action: ChangeOrderAction
  /** Baris WO existing untuk ubah/hapus; null untuk tambah. */
  workOrderItemId: number | null
  itemId: number
  description?: string | null
  uom?: string | null
  qtyBefore?: number | null
  qtyAfter?: number | null
  costBefore?: number | null
  costAfter?: number | null
  unitPriceBefore?: number | null
  unitPriceAfter?: number | null
  discountBefore?: number | null
  discountAfter?: number | null
  discountType?: string | null
}

export interface ChangeOrderTransition {
  from: JobChangeOrderStatus
  to: JobChangeOrderStatus
}

/** Matriks transisi §3 spec (ditegakkan server lewat builder ini). */
export const CHANGE_ORDER_TRANSITIONS: ChangeOrderTransition[] = [
  { from: "draft", to: "menunggu_pelanggan" },
  { from: "menunggu_pelanggan", to: "disetujui" },
  { from: "menunggu_pelanggan", to: "ditolak" },
  { from: "disetujui", to: "diterapkan" },
  { from: "draft", to: "dibatalkan" },
  { from: "menunggu_pelanggan", to: "dibatalkan" },
]

export function isChangeOrderTransitionAllowed(
  from: string,
  to: string,
): boolean {
  return CHANGE_ORDER_TRANSITIONS.some((t) => t.from === from && t.to === to)
}

export function assertChangeOrderTransition(from: string, to: JobChangeOrderStatus): void {
  if (!isChangeOrderTransitionAllowed(from, to)) {
    throw new Error(
      `Transisi change order dari '${from}' ke '${to}' tidak diizinkan.`,
    )
  }
}

export function assertWorkOrderEligibleForChangeOrder(input: {
  workOrderStatus: string
  quotationId: number | null
}): void {
  if (!input.quotationId) {
    throw new Error(
      "Perintah Kerja tanpa penawaran tertaut tidak dapat dibuatkan change order — tidak ada sumber nilai kontrak tunggal (BR-CO-10).",
    )
  }
  if (
    !(CHANGE_ORDER_ALLOWED_WORK_ORDER_STATUSES as readonly string[]).includes(
      input.workOrderStatus,
    )
  ) {
    throw new Error(
      `Change order hanya boleh dibuka pada Perintah Kerja berstatus pending, in_progress, atau completed. Status saat ini '${input.workOrderStatus}'.`,
    )
  }
}

export interface QuotationLineForChangeOrder {
  id: number
  itemId: number | null
  unitPrice: number
  description: string | null
}

/**
 * Pencocokan deterministik baris CO ubah/hapus -> baris quotation.
 * Urutan kandidat persis: (1) itemId+unitPriceBefore+description,
 * (2) itemId+unitPriceBefore, (3) itemId saja. Ambigu (>1 kandidat di
 * tingkat mana pun yang menghasilkan hit) = konflik eksplisit, bukan
 * tebakan diam-diam: penawaran berubah sejak CO dibuat.
 */
export function resolveQuotationItemForChange(
  lines: QuotationLineForChangeOrder[],
  input: { itemId: number; unitPriceBefore: number | null; description: string | null },
): { item: QuotationLineForChangeOrder | null; ambiguous: boolean } {
  const tiers: ((l: QuotationLineForChangeOrder) => boolean)[] = [
    (l) =>
      (l.itemId ?? 0) === input.itemId &&
      Number(l.unitPrice) === Number(input.unitPriceBefore ?? 0) &&
      (l.description ?? null) === (input.description ?? null),
    (l) =>
      (l.itemId ?? 0) === input.itemId &&
      Number(l.unitPrice) === Number(input.unitPriceBefore ?? 0),
    (l) => (l.itemId ?? 0) === input.itemId,
  ]
  for (const match of tiers) {
    const hits = lines.filter(match)
    if (hits.length === 1) return { item: hits[0], ambiguous: false }
    if (hits.length > 1) return { item: null, ambiguous: true }
  }
  return { item: null, ambiguous: false }
}

/**
 * Kunci baris ter-issue (BR-CO-03): baris WO yang sudah punya
 * MaterialIssueItem pada MaterialIssue status apa pun terkunci total.
 * Issue legacy tanpa workOrderItemId (null) dikaitkan per itemId ke
 * baris WO pertama yang cocok — pola reviseWorkOrderItems existing,
 * supaya baris ter-issue lama tidak lolos hanya karena FK kosong.
 */
export function computeLockedWorkOrderItemIds(input: {
  workOrderItems: { id: number; itemId: number }[]
  issuedItems: { workOrderItemId: number | null; itemId: number }[]
}): Set<number> {
  const locked = new Set<number>()
  const byItemId = new Map<number, number>()
  for (const row of input.workOrderItems) {
    if (!byItemId.has(row.itemId)) byItemId.set(row.itemId, row.id)
  }
  for (const issued of input.issuedItems) {
    if (issued.workOrderItemId != null) {
      locked.add(issued.workOrderItemId)
    } else {
      const fallback = byItemId.get(issued.itemId)
      if (fallback != null) locked.add(fallback)
    }
  }
  return locked
}

export function assertLinesNotLocked(
  lines: ChangeOrderLineInput[],
  lockedIds: Set<number>,
): void {
  const conflict = lines.find(
    (l) => l.workOrderItemId != null && lockedIds.has(l.workOrderItemId),
  )
  if (conflict) {
    throw new Error(
      `Baris perintah kerja #${conflict.workOrderItemId} sudah pernah dikeluarkan lewat Pengeluaran Material (MaterialIssueItem tertaut) dan terkunci — penggantian part berjalan lewat jalur Pengeluaran Material/retur, bukan change order. (Penjaga CO memakai SEMUA status MaterialIssue, lebih ketat dari guard revisi existing yang hanya completed.)`,
    )
  }
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

/** Nilai tagih satu baris: qty x harga sesudah diskon baris. */
export function computeChangeOrderLineValue(input: {
  qty: number
  unitPrice: number
  discount?: number | null
  discountType?: string | null
}): number {
  const qty = Math.max(0, input.qty || 0)
  const unitPrice = Math.max(0, input.unitPrice || 0)
  const subtotal = qty * unitPrice
  let discount = Math.max(0, Number(input.discount) || 0)
  if (input.discountType === "percent") {
    discount = (subtotal * Math.min(100, discount)) / 100
  }
  return round2(Math.max(0, subtotal - discount))
}

/**
 * Selisih informasi persetujuan dari baris CO (BR-CO-01: snapshot,
 * bukan dasar jurnal). Baris hapus menyumbang negatif nilai sebelum;
 * tambah positif nilai sesudah; ubah selisih sesudah-sebelum.
 */
export function computeChangeOrderSelisih(lines: ChangeOrderLineInput[]): number {
  let total = 0
  for (const line of lines) {
    const before =
      line.action === "tambah"
        ? 0
        : computeChangeOrderLineValue({
            qty: Number(line.qtyBefore) || 0,
            unitPrice: Number(line.unitPriceBefore) || 0,
            discount: line.discountBefore,
            discountType: line.discountType,
          })
    const after =
      line.action === "hapus"
        ? 0
        : computeChangeOrderLineValue({
            qty: Number(line.qtyAfter) || 0,
            unitPrice: Number(line.unitPriceAfter) || 0,
            discount: line.discountAfter,
            discountType: line.discountType,
          })
    total = round2(total + (after - before))
  }
  return round2(total)
}

/** Nomor dokumen CO urut per WO (BR-CO-06): CO-001, CO-002, ... */
export function formatChangeOrderDocumentNo(workOrderDocumentNo: string, sequence: number): string {
  const seq = String(Math.max(1, Math.trunc(sequence) || 1)).padStart(3, "0")
  return `${workOrderDocumentNo}-CO-${seq}`
}
