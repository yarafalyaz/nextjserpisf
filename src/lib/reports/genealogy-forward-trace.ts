/**
 * Forward-trace genealogi produksi (PRD baris 369 / REP-13).
 *
 * Backward-trace (serial hasil → bahan) sudah tampil di detail Perintah
 * Produksi. Modul ini arah sebaliknya: dari lot/serial bahan yang dipakai,
 * temukan Perintah Produksi / hasil jadi yang mengonsumsinya.
 *
 * Pencocokan bersifat eksak per token (case-insensitive): `LOT-1` tidak
 * boleh menunjuk order yang hanya memakai `LOT-10`. `batchNumber` di
 * `ProductionGenealogyMaterial` disimpan tergabung koma oleh
 * `recordProductionGenealogy`, jadi dipecah dulu per token.
 *
 * Pure (tanpa Prisma/DOM).
 */

export interface GenealogyMaterialTraceInput {
  itemId: number
  serialNumbers?: unknown
  batchNumber?: string | null
}

export interface GenealogyTraceInput {
  productionOrderId: number
  productionOrderDocumentNo: string
  productionOrderSlug?: string | null
  documentNo: string
  outputItemId: number
  outputQty: number
  outputSerials?: unknown
  outputBatch?: string | null
  completedAt: Date
  completedBy?: number | null
  materials: GenealogyMaterialTraceInput[]
}

export interface ForwardTraceHit {
  productionOrderId: number
  productionOrderDocumentNo: string
  productionOrderSlug: string | null
  documentNo: string
  outputItemId: number
  outputQty: number
  outputSerials: string[]
  outputBatch: string | null
  completedAt: Date
  completedBy: number | null
  /** Token lot/serial yang cocok dengan kueri. */
  matchedTokens: string[]
  /** itemId bahan yang tokennya cocok. */
  matchedItemIds: number[]
}

export function normalizeTraceQuery(query: string): string {
  return query.trim()
}

function stringTokens(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((v): v is string => typeof v === "string" && v.trim().length > 0).map((v) => v.trim())
}

/** Semua token lot/serial yang tercatat pada satu baris bahan genealogy. */
export function genealogyMaterialTokens(material: GenealogyMaterialTraceInput): string[] {
  const batchTokens = (material.batchNumber ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean)
  return [...new Set([...batchTokens, ...stringTokens(material.serialNumbers)])]
}

export function outputSerialTokens(outputSerials: unknown): string[] {
  return stringTokens(outputSerials)
}

/**
 * Susun hasil forward-trace: genealogy yang salah satu bahan­nya memakai
 * lot/serial `query` (eksak, case-insensitive). Kueri kosong → tidak ada hasil.
 */
export function buildForwardTrace(input: {
  genealogies: GenealogyTraceInput[]
  query: string
}): ForwardTraceHit[] {
  const query = normalizeTraceQuery(input.query)
  if (!query) return []
  const needle = query.toLocaleLowerCase("id-ID")

  const hits: ForwardTraceHit[] = []
  for (const g of input.genealogies) {
    const matchedTokens: string[] = []
    const matchedItemIds: number[] = []
    for (const m of g.materials) {
      const hitTokens = genealogyMaterialTokens(m).filter((t) => t.toLocaleLowerCase("id-ID") === needle)
      if (hitTokens.length === 0) continue
      matchedTokens.push(...hitTokens)
      if (!matchedItemIds.includes(m.itemId)) matchedItemIds.push(m.itemId)
    }
    if (matchedTokens.length === 0) continue
    hits.push({
      productionOrderId: g.productionOrderId,
      productionOrderDocumentNo: g.productionOrderDocumentNo,
      productionOrderSlug: g.productionOrderSlug ?? null,
      documentNo: g.documentNo,
      outputItemId: g.outputItemId,
      outputQty: g.outputQty,
      outputSerials: outputSerialTokens(g.outputSerials),
      outputBatch: g.outputBatch ?? null,
      completedAt: g.completedAt,
      completedBy: g.completedBy ?? null,
      matchedTokens: [...new Set(matchedTokens)],
      matchedItemIds,
    })
  }
  return hits.sort((a, b) => b.completedAt.getTime() - a.completedAt.getTime())
}

/**
 * Label penampil `completedBy`. `ProductionGenealogy.completedBy` hanya
 * kolom Int tanpa relasi User di skema, jadi nama di-resolve pemanggil
 * lewat lookup User. Bila user sudah terhapus, jatuh ke penanda id agar
 * tetap bisa ditelusuri — bukan nama yang dikarang.
 */
export function completedByLabel(
  completedBy: number | null | undefined,
  userNameById: ReadonlyMap<number, string>,
): string | null {
  if (completedBy == null) return null
  return userNameById.get(completedBy) ?? `Pengguna #${completedBy}`
}
