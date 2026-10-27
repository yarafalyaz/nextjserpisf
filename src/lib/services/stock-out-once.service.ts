import type { TxClient } from "@/lib/db/prisma"

/**
 * SAL-BR-014: guard tepat-satu-kali pengurangan stok lintas jalur keluar.
 *
 * Skenario ganda nyata (terbukti di kode): satu quotation yang sama
 * melahirkan Work Order + Material Issue (StockMove OUT
 * referenceType "MaterialIssue") DAN faktur penjualan hasil konversi
 * (StockMove OUT referenceType "SalesInvoice") atas item fisik yang sama.
 * Tanpa guard silang, kebutuhan material yang sama berkurang dua kali:
 * sekali sebagai material proyek, sekali sebagai penjualan.
 *
 * Guard ini adalah SATU-SATUNYA titik keputusan silang itu. Kedua hook
 * posting (onSalesInvoicePosted, onMaterialIssueCompleted) wajib
 * memanggilnya di dalam transaksi mereka SEBELUM stok bergerak:
 *  - Arah penjualan: tolak bila kebutuhan item ini sudah dikeluarkan
 *    sebagai material proyek untuk pohon dokumen yang sama.
 *  - Arah material: tolak bila item ini sudah dikeluarkan sebagai
 *    penjualan untuk pohon dokumen yang sama.
 * Fail-closed: jembatan dokumen tak ter-resolusi (tak ada quotation
 * bersama) = tidak ada konflik yang bisa dibuktikan, jalur berjalan
 * seperti sebelumnya; konflik terbukti = throw (rollback seluruh tx).
 *
 * "Sudah dikeluarkan" = StockMove OUT berstatus posted. Move reversed
 * tidak dihitung: reversal membatalkan pengeluaran pertama, jadi
 * pengeluaran pengganti sah.
 */
export type StockOutSourceKind = "SalesInvoice" | "MaterialIssue"

export interface StockOutConflictLine {
  itemId: number
  /** Qty kandidat jalur ini (satuan dasar), untuk pesan operator. */
  candidateQty: number
  /** Qty yang sudah dikeluarkan jalur lawan (posted OUT). */
  alreadyOutQty: number
  /** Dokumen sumber pengeluaran lawan (documentNo StockMove). */
  sourceDocumentNo: string | null
  /** Jenis dokumen lawan. */
  sourceKind: StockOutSourceKind
}

const EPS = 1e-9

/** Semua faktur penjualan pada pohon quotation ini (3 jembatan existing). */
async function invoiceIdsForQuotation(
  tx: TxClient,
  quotationId: number,
): Promise<number[]> {
  const [direct, salesOrders, workOrders] = await Promise.all([
    tx.salesInvoice.findMany({
      where: { quotationId, deletedAt: null },
      select: { id: true },
    }),
    tx.salesOrder.findMany({
      where: { quotationId, deletedAt: null },
      select: { id: true },
    }),
    tx.workOrder.findMany({
      where: { quotationId },
      select: { id: true, projectId: true },
    }),
  ])
  const ids = new Set<number>(direct.map((d) => d.id))
  const soIds = salesOrders.map((s) => s.id)
  if (soIds.length > 0) {
    const viaSo = await tx.salesInvoice.findMany({
      where: { salesOrderId: { in: soIds }, deletedAt: null },
      select: { id: true },
    })
    for (const v of viaSo) ids.add(v.id)
  }
  const projectIds = [
    ...new Set(
      workOrders
        .map((w) => w.projectId)
        .filter((p): p is number => p != null),
    ),
  ]
  if (projectIds.length > 0) {
    const viaProject = await tx.salesInvoice.findMany({
      where: { projectId: { in: projectIds }, deletedAt: null },
      select: { id: true },
    })
    for (const v of viaProject) ids.add(v.id)
  }
  return [...ids]
}

/** Semua material issue pada pohon quotation ini (via WO / proyek). */
async function materialIssueIdsForQuotation(
  tx: TxClient,
  quotationId: number,
): Promise<number[]> {
  const workOrders = await tx.workOrder.findMany({
    where: { quotationId },
    select: { id: true, projectId: true },
  })
  const woIds = workOrders.map((w) => w.id)
  const projectIds = [
    ...new Set([
      ...workOrders
        .map((w) => w.projectId)
        .filter((p): p is number => p != null),
      ...(
        await tx.project.findMany({
          where: { contractQuotationId: quotationId },
          select: { id: true },
        })
      ).map((p) => p.id),
    ]),
  ]
  const [viaWo, viaProject] = await Promise.all([
    woIds.length > 0
      ? tx.materialIssue.findMany({
          where: { workOrderId: { in: woIds } },
          select: { id: true },
        })
      : Promise.resolve([] as { id: number }[]),
    projectIds.length > 0
      ? tx.materialIssue.findMany({
          where: { projectId: { in: projectIds } },
          select: { id: true },
        })
      : Promise.resolve([] as { id: number }[]),
  ])
  return [...new Set([...viaWo, ...viaProject].map((m) => m.id))]
}

async function postedOutByItem(
  tx: TxClient,
  referenceType: StockOutSourceKind,
  referenceIds: number[],
): Promise<Map<number, { qty: number; documentNo: string | null }>> {
  const out = new Map<number, { qty: number; documentNo: string | null }>()
  if (referenceIds.length === 0) return out
  const moves = await tx.stockMove.findMany({
    where: {
      referenceType,
      referenceId: { in: referenceIds },
      impact: "OUT",
      status: "posted",
    },
    select: { itemId: true, qty: true, documentNo: true },
  })
  for (const m of moves) {
    const prev = out.get(m.itemId)
    out.set(m.itemId, {
      qty: (prev?.qty ?? 0) + Number(m.qty),
      documentNo: prev?.documentNo ?? m.documentNo,
    })
  }
  return out
}

/**
 * Inti guard. `candidate` = baris item jalur yang AKAN posting
 * (qty satuan dasar). Dokumen lawan dikumpulkan dari pohon quotation
 * yang sama, TANPA dokumen kandidat sendiri. Konflik per item: jalur
 * lawan sudah mengeluarkan qty posted > 0 untuk item yang sama pada
 * pohon bersama — kedua jalur mengklaim kebutuhan fisik yang sama.
 */
export async function findStockOutConflicts(
  tx: TxClient,
  input: {
    candidateKind: StockOutSourceKind
    candidateLines: Array<{ itemId: number; qty: number }>
    sharedQuotationId: number | null
    excludeSalesInvoiceId?: number
    excludeMaterialIssueId?: number
  },
): Promise<StockOutConflictLine[]> {
  if (input.sharedQuotationId == null) return []
  const candidateByItem = new Map<number, number>()
  for (const line of input.candidateLines) {
    if (!(line.qty > 0)) continue
    candidateByItem.set(
      line.itemId,
      (candidateByItem.get(line.itemId) ?? 0) + line.qty,
    )
  }
  if (candidateByItem.size === 0) return []

  const opposingKind: StockOutSourceKind =
    input.candidateKind === "SalesInvoice" ? "MaterialIssue" : "SalesInvoice"
  const opposingIds =
    opposingKind === "MaterialIssue"
      ? (await materialIssueIdsForQuotation(tx, input.sharedQuotationId)).filter(
          (id) => id !== input.excludeMaterialIssueId,
        )
      : (await invoiceIdsForQuotation(tx, input.sharedQuotationId)).filter(
          (id) => id !== input.excludeSalesInvoiceId,
        )
  if (opposingIds.length === 0) return []

  const already = await postedOutByItem(tx, opposingKind, opposingIds)
  const conflicts: StockOutConflictLine[] = []
  for (const [itemId, candidateQty] of candidateByItem) {
    const prev = already.get(itemId)
    if (!prev || !(prev.qty > EPS)) continue
    conflicts.push({
      itemId,
      candidateQty,
      alreadyOutQty: prev.qty,
      sourceDocumentNo: prev.documentNo,
      sourceKind: opposingKind,
    })
  }
  return conflicts
}

function conflictMessage(
  candidateKind: StockOutSourceKind,
  conflicts: StockOutConflictLine[],
): string {
  const first = conflicts[0]
  const lawan =
    first.sourceKind === "MaterialIssue"
      ? "pengeluaran material proyek"
      : "faktur penjualan"
  const arah =
    candidateKind === "SalesInvoice"
      ? "Faktur penjualan"
      : "Pengeluaran material"
  const doc = first.sourceDocumentNo ? ` (${first.sourceDocumentNo})` : ""
  const extra =
    conflicts.length > 1 ? ` dan ${conflicts.length - 1} item lain` : ""
  return (
    `${arah} ditolak: item #${first.itemId}${extra} sudah dikeluarkan ` +
    `sebanyak ${first.alreadyOutQty} lewat ${lawan}${doc} untuk ` +
    `kebutuhan proyek/penjualan yang sama (SAL-BR-014). Satu kebutuhan ` +
    `material hanya boleh mengurangi stok satu kali — batalkan salah ` +
    `satu jalur (void faktur atau batalkan pengeluaran material) ` +
    `sebelum melanjutkan.`
  )
}

/**
 * Gerbang fail-closed untuk hook penjualan. Dipanggil
 * onSalesInvoicePosted di dalam tx, sebelum stok bergerak.
 */
export async function assertSalesInvoiceStockOutOnce(
  tx: TxClient,
  invoiceId: number,
  candidateLines: Array<{ itemId: number; qty: number }>,
): Promise<void> {
  const invoice = await tx.salesInvoice.findUnique({
    where: { id: invoiceId },
    select: { quotationId: true, salesOrderId: true, projectId: true },
  })
  if (!invoice) return
  // Kumpulkan kandidat MI pada pohon yang sama lewat resolusi per-MI tidak
  // efisien; resolusi pohon dilakukan sekali dari sisi faktur:
  const quotationIds = new Set<number>()
  if (invoice.quotationId != null) quotationIds.add(invoice.quotationId)
  if (invoice.salesOrderId != null) {
    const so = await tx.salesOrder.findUnique({
      where: { id: invoice.salesOrderId },
      select: { quotationId: true },
    })
    if (so?.quotationId != null) quotationIds.add(so.quotationId)
  }
  if (invoice.projectId != null) {
    const project = await tx.project.findUnique({
      where: { id: invoice.projectId },
      select: { contractQuotationId: true },
    })
    if (project?.contractQuotationId != null) {
      quotationIds.add(project.contractQuotationId)
    }
  }
  for (const quotationId of quotationIds) {
    const conflicts = await findStockOutConflicts(tx, {
      candidateKind: "SalesInvoice",
      candidateLines,
      sharedQuotationId: quotationId,
      excludeSalesInvoiceId: invoiceId,
    })
    if (conflicts.length > 0) {
      throw new Error(conflictMessage("SalesInvoice", conflicts))
    }
  }
}

/**
 * Gerbang fail-closed untuk hook material issue. Dipanggil
 * onMaterialIssueCompleted di dalam tx, sebelum stok bergerak.
 */
export async function assertMaterialIssueStockOutOnce(
  tx: TxClient,
  issueId: number,
  candidateLines: Array<{ itemId: number; qty: number }>,
): Promise<void> {
  const issue = await tx.materialIssue.findUnique({
    where: { id: issueId },
    select: { workOrderId: true, projectId: true },
  })
  if (!issue) return
  const quotationIds = new Set<number>()
  if (issue.workOrderId != null) {
    const wo = await tx.workOrder.findUnique({
      where: { id: issue.workOrderId },
      select: { quotationId: true, projectId: true },
    })
    if (wo?.quotationId != null) quotationIds.add(wo.quotationId)
    if (wo?.projectId != null) {
      const project = await tx.project.findUnique({
        where: { id: wo.projectId },
        select: { contractQuotationId: true },
      })
      if (project?.contractQuotationId != null) {
        quotationIds.add(project.contractQuotationId)
      }
    }
  }
  if (issue.projectId != null) {
    const project = await tx.project.findUnique({
      where: { id: issue.projectId },
      select: { contractQuotationId: true },
    })
    if (project?.contractQuotationId != null) {
      quotationIds.add(project.contractQuotationId)
    }
  }
  // MI tertaut WO tanpa quotation di WO: jembatan proyek langsung.
  for (const quotationId of quotationIds) {
    const conflicts = await findStockOutConflicts(tx, {
      candidateKind: "MaterialIssue",
      candidateLines,
      sharedQuotationId: quotationId,
      excludeMaterialIssueId: issueId,
    })
    if (conflicts.length > 0) {
      throw new Error(conflictMessage("MaterialIssue", conflicts))
    }
  }
}
