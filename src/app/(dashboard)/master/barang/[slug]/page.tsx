import { Pencil, AlertTriangle } from "lucide-react"
export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission, hasPermission } from "@/lib/auth/permissions"
import { CanCreate } from "@/components/auth/can-create"
import { entityEditHref } from "@/lib/utils/entity-url"
import { resolveEntity } from "@/lib/utils/resolve-entity"
import { formatCurrency, formatDate, formatReferenceType } from "@/lib/utils/format"
import Link from "next/link"
import { notFound } from "next/navigation"
import { EmptyState } from "@/components/ui/empty-state"
import { DetailTabs } from "@/components/ui/detail-tabs"
import { StatusChip } from "@/components/ui/status-chip"
import { DeleteButton } from "@/components/ui/delete-button"
import { deleteItem } from "@/actions/master.actions"
import { PageHeader, BackButton } from "@/components/ui/page-header"
import { Button } from "@/components/ui/button"
import { DetailCard, DetailField, DetailSection } from "@/components/ui/detail-card"
import { DetailTable, DetailTableHead, DetailTableTh, DetailTableBody, DetailTableRow, DetailTableTd } from "@/components/ui/detail-table"
import { QrCodeDisplay } from "@/components/ui/qr-code-display"
import { ItemImageLightbox } from "@/components/ui/item-image-lightbox"
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/shadcn/alert"
import { ItemSubstitutesPanel } from "@/components/items/item-substitutes-panel"
import { ItemWarehouseMinStockPanel } from "@/components/items/item-warehouse-min-stock-panel"
import { MIN_STOCK_GLOBAL_LABEL, MIN_STOCK_OVERRIDE_LABEL } from "@/lib/reports/min-stock-data"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Barang" }

function isDescriptionWhitespace(char: string): boolean {
  return char !== "" && char.trim() === ""
}

/**
 * Manual replacement for the old lazy dari/from and untuk/to/for regexes.
 * Finds the leftmost keyword followed by whitespace, then takes the text
 * after it up to the first "-" / "–" separator (or end of string), trimmed.
 * Returns null when no keyword pattern is present.
 */
function extractPartyFromDescription(description: string, keywords: readonly string[]): string | null {
  const lower = description.toLowerCase()
  for (let index = 0; index < description.length; index += 1) {
    const keyword = keywords.find((candidate) => lower.startsWith(candidate, index))
    if (!keyword) continue
    let start = index + keyword.length
    if (start >= description.length || !isDescriptionWhitespace(description.charAt(start))) continue
    while (start < description.length && isDescriptionWhitespace(description.charAt(start))) start += 1
    if (start >= description.length) continue
    let end = description.length
    // The old capture required at least one character before the separator.
    for (let cursor = start + 1; cursor < description.length; cursor += 1) {
      const char = description.charAt(cursor)
      if (char === "-" || char === "–") {
        end = cursor
        break
      }
    }
    const party = description.slice(start, Math.min(end, start + 500)).trim()
    if (party) return party
  }
  return null
}

export default async function ItemDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  await requirePermission("view_items")
  const { slug } = await params

  const item = await resolveEntity(
    { segment: slug },
    {
      bySlug: (s) =>
        prisma.item.findFirst({
          where: { slug: s },
          include: {
            category: true,
            warehouse: true,
            rack: true,
            rackRow: true,
            stockMoves: { orderBy: { createdAt: "desc" }, include: { warehouse: true } },
            inventoryLayers: { where: { remaining: { gt: 0 } }, orderBy: { createdAt: "asc" } },
            uomConversions: { orderBy: { code: "asc" } },
            itemBatches: { orderBy: { createdAt: "desc" } },
            itemSerials: { orderBy: { createdAt: "desc" } },
          },
        }),
      byId: (id) =>
        prisma.item.findUnique({
          where: { id },
          include: {
            category: true,
            warehouse: true,
            rack: true,
            rackRow: true,
            stockMoves: { orderBy: { createdAt: "desc" }, include: { warehouse: true } },
            inventoryLayers: { where: { remaining: { gt: 0 } }, orderBy: { createdAt: "asc" } },
            uomConversions: { orderBy: { code: "asc" } },
            itemBatches: { orderBy: { createdAt: "desc" } },
            itemSerials: { orderBy: { createdAt: "desc" } },
          },
        }),
    },
  )

  if (!item) notFound()

  // F-2026-10-22-069-S: tab Substitusi (Q-SUB69-4) — opsi pengganti dari
  // master existing, kelola digerbang edit_items di page + server.
  // Izin kelola nyata sesi (edit_items): gerbang kontrol substitusi +
  // panel stok minimum per gudang (F-070-E); server tetap otoritas.
  const [canEditItems, substituteItemOptions] = await Promise.all([
    hasPermission("edit_items"),
    prisma.item.findMany({
      where: { isActive: true, deletedAt: null, isService: false },
      select: { id: true, name: true, sku: true },
      orderBy: { name: "asc" },
      take: 500,
    }),
  ])

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.AUTH_URL || process.env.NEXTAUTH_URL || ""
  const trackCode = item.sku
  const qrUrl = `${baseUrl}/inventaris/scan?code=${encodeURIComponent(trackCode)}`

  const isLowStock = Number(item.minStock) > 0 && Number(item.qtyOnHand) <= Number(item.minStock)

  // Batch-fetch all references upfront to eliminate N+1 (was 2-4 queries per stock move)
  const grIds = item.stockMoves.filter(sm => sm.referenceType === "GoodsReceipt" && sm.referenceId).map(sm => sm.referenceId!)
  const miIds = item.stockMoves.filter(sm => sm.referenceType === "MaterialIssue" && sm.referenceId).map(sm => sm.referenceId!)
  const srIds = item.stockMoves.filter(sm => sm.referenceType === "SalesReturn" && sm.referenceId).map(sm => sm.referenceId!)
  const prIds = item.stockMoves.filter(sm => sm.referenceType === "PurchaseReturn" && sm.referenceId).map(sm => sm.referenceId!)
  const woIds = item.stockMoves.filter(sm => (sm.referenceType === "WorkOrder" || sm.referenceType === "MaterialIssue") && sm.referenceId).map(sm => sm.referenceId!)

  const [goodsReceipts, materialIssues, salesReturns, purchaseReturns, workOrders] = await Promise.all([
    grIds.length ? prisma.goodsReceipt.findMany({ where: { id: { in: grIds } }, select: { id: true, purchaseOrderId: true } }) : [],
    miIds.length ? prisma.materialIssue.findMany({ where: { id: { in: miIds } }, select: { id: true, projectId: true, workOrderId: true } }) : [],
    srIds.length ? prisma.salesReturn.findMany({ where: { id: { in: srIds } }, select: { id: true, customerId: true } }) : [],
    prIds.length ? prisma.purchaseReturn.findMany({ where: { id: { in: prIds } }, select: { id: true, purchaseOrderId: true } }) : [],
    woIds.length ? prisma.workOrder.findMany({ where: { id: { in: woIds } }, select: { id: true, projectId: true } }) : [],
  ])

  // Resolve nested references in batch
  const poIdsFromGr = goodsReceipts.map(gr => gr.purchaseOrderId).filter(Boolean) as number[]
  const poIdsFromPr = purchaseReturns.map(pr => pr.purchaseOrderId).filter(Boolean) as number[]
  const allPoIds = [...new Set([...poIdsFromGr, ...poIdsFromPr])]
  const projectIdsFromMi = materialIssues.map(mi => mi.projectId).filter(Boolean) as number[]
  const projectIdsFromWo = workOrders.map(wo => wo.projectId).filter(Boolean) as number[]
  const allProjectIds = [...new Set([...projectIdsFromMi, ...projectIdsFromWo])]
  const customerIdsFromSr = salesReturns.map(sr => sr.customerId).filter(Boolean) as number[]

  const [purchaseOrders, projects, customers] = await Promise.all([
    allPoIds.length ? prisma.purchaseOrder.findMany({ where: { id: { in: allPoIds } }, include: { vendor: true } }) : [],
    allProjectIds.length ? prisma.project.findMany({ where: { id: { in: allProjectIds } }, include: { customer: true, customerVehicle: true } }) : [],
    customerIdsFromSr.length ? prisma.customer.findMany({ where: { id: { in: customerIdsFromSr } }, select: { id: true, name: true } }) : [],
  ])

  // Build lookup maps
  const grMap = new Map(goodsReceipts.map(g => [g.id, g]))
  const miMap = new Map(materialIssues.map(m => [m.id, m]))
  const srMap = new Map(salesReturns.map(s => [s.id, s]))
  const prMap = new Map(purchaseReturns.map(p => [p.id, p]))
  const woMap = new Map(workOrders.map(w => [w.id, w]))
  const poMap = new Map(purchaseOrders.map(p => [p.id, p]))
  const projMap = new Map(projects.map(p => [p.id, p]))
  const custMap = new Map(customers.map(c => [c.id, c]))

  const stockMovesWithRef = item.stockMoves.map((sm) => {
    let party = "-"
    let partyLabel = ""
    let docLink = ""

    if (sm.referenceType && sm.referenceId) {
      switch (sm.referenceType) {
        case "GoodsReceipt": {
          const gr = grMap.get(sm.referenceId)
          if (gr?.purchaseOrderId) {
            const po = poMap.get(gr.purchaseOrderId)
            if (po?.vendor) { party = po.vendor.name; partyLabel = "Pemasok" }
          }
          docLink = `/pembelian/penerimaan/${sm.referenceId}`
          break
        }
        case "MaterialIssue": {
          const mi = miMap.get(sm.referenceId)
          if (mi?.projectId) {
            const proj = projMap.get(mi.projectId)
            if (proj?.customer) {
              party = proj.customer.name
              if (proj.customerVehicle) party += ` (${proj.customerVehicle.plateNumber || ''})`
              partyLabel = "Pelanggan"
            } else if (proj) {
              party = proj.name
              partyLabel = "Proyek"
            }
          } else if (mi?.workOrderId) {
            const wo = woMap.get(mi.workOrderId)
            if (wo?.projectId) {
              const proj = projMap.get(wo.projectId)
              if (proj?.customer) {
                party = proj.customer.name
                if (proj.customerVehicle) party += ` (${proj.customerVehicle.plateNumber || ''})`
                partyLabel = "Pelanggan"
              }
            }
          }
          docLink = `/inventaris/pengeluaran-material/${sm.referenceId}`
          break
        }
        case "SalesReturn": {
          const sr = srMap.get(sm.referenceId)
          if (sr?.customerId) {
            const cust = custMap.get(sr.customerId)
            if (cust) { party = cust.name; partyLabel = "Pelanggan" }
          }
          docLink = `/penjualan/retur/${sm.referenceId}`
          break
        }
        case "PurchaseReturn": {
          const pr = prMap.get(sm.referenceId)
          if (pr?.purchaseOrderId) {
            const po = poMap.get(pr.purchaseOrderId)
            if (po?.vendor) { party = po.vendor.name; partyLabel = "Pemasok" }
          }
          docLink = `/pembelian/retur/${sm.referenceId}`
          break
        }
        case "StockAdjustment": {
          partyLabel = "Internal"
          party = "Penyesuaian Stok"
          docLink = `/inventaris/penyesuaian/${sm.referenceId}`
          break
        }
        case "InventoryTransfer": {
          partyLabel = "Internal"
          party = "Transfer Gudang"
          docLink = `/inventaris/transfer/${sm.referenceId}`
          break
        }
        case "WorkOrder": {
          const wo = woMap.get(sm.referenceId)
          if (wo?.projectId) {
            const proj = projMap.get(wo.projectId)
            if (proj) { party = proj.name; partyLabel = "Proyek" }
          } else {
            partyLabel = "Produksi"
            party = "Perintah Kerja"
          }
          docLink = `/produksi/perintah-kerja/${sm.referenceId}`
          break
        }
      }
    }

    // Fallback: extract party info from description if not resolved
    if (party === "-" && sm.description) {
      // Try to extract "dari X" or "untuk X" or "dari X - reason"
      const dariParty = extractPartyFromDescription(sm.description, ["dari", "from"])
      const untukParty = dariParty === null ? extractPartyFromDescription(sm.description, ["untuk", "to", "for"]) : null
      if (dariParty !== null) { party = dariParty; partyLabel = "Pemasok" }
      else if (untukParty !== null) { party = untukParty; partyLabel = "Pelanggan" }
      else { party = sm.description }
    }

    return { ...sm, party, partyLabel, docLink }
  })

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={item.name}
        breadcrumbs={[
          { label: "Dasbor", href: "/" },
          { label: "Data Master", href: "/master" },
          { label: "Barang", href: "/master/barang" },
          { label: "Detail" },
        ]}
        badge={item.isProduct ? (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary">Produk</span>
        ) : undefined}
        actions={
          <>
            <CanCreate permission="edit_items">
              <Button href={entityEditHref("/master/barang", item)} variant="secondary"><Pencil size={14} /> Ubah</Button>
            </CanCreate>
            <CanCreate permission="delete_items">
              <DeleteButton id={item.id} action={deleteItem} label={`Hapus barang ${item.name}`} />
            </CanCreate>
            <BackButton href="/master/barang" />
          </>
        }
      />

      {isLowStock && (
        <Alert variant="warning">
          <AlertTriangle />
          <AlertTitle>Stok menipis</AlertTitle>
          <AlertDescription>
            Stok saat ini {Number(item.qtyOnHand)} {item.unitOfMeasure} sudah di bawah atau sama dengan minimum ({Number(item.minStock)} {item.unitOfMeasure}). Pertimbangkan untuk melakukan pembelian.
          </AlertDescription>
        </Alert>
      )}

      <DetailTabs
        ariaLabel="Tab detail barang"
        tabs={[
          {
            id: "info",
            label: "Informasi",
            content: (
              <>
                {item.image && (
                  <DetailSection title="Gambar Barang">
                    <div className="flex justify-center">
                      <ItemImageLightbox src={item.image} alt={item.name} />
                    </div>
                  </DetailSection>
                )}
                <DetailCard>
                  <DetailField label="SKU" value={item.sku} mono />
                  <DetailField label="Kategori" value={item.category?.name || "-"} />
                  <DetailField label="Satuan" value={item.unitOfMeasure} />
                  <DetailField label="Stok Saat Ini" value={
                    <span className={isLowStock ? "text-danger" : ""}>
                      {Number(item.qtyOnHand)} {item.unitOfMeasure}
                      {isLowStock && " (Stok Menipis)"}
                    </span>
                  } />
                  <DetailField label="Stok Minimum" value={String(Number(item.minStock))} />
                  <DetailField label="Harga Beli" value={formatCurrency(Number(item.cost))} />
                  <DetailField label="Harga Jual" value={formatCurrency(Number(item.price))} />
                  <DetailField label="Nilai Stok" value={formatCurrency(Number(item.qtyOnHand) * Number(item.cost))} />
                </DetailCard>

                <DetailCard>
                  <DetailField label="Gudang" value={item.warehouse?.name || "-"} />
                  <DetailField label="Rak" value={item.rack?.name || "-"} />
                  <DetailField label="Baris" value={item.rackRow?.name || "-"} />
                </DetailCard>

                <DetailSection title="Kode QR">
                  <QrCodeDisplay value={qrUrl} size={148} />
                  <p className="text-xs text-muted-foreground mt-2">Pindai QR ini untuk membuka data barang (akses sesuai hak login).</p>
                </DetailSection>
                {item.description && (
                  <DetailCard>
                    <DetailField label="Deskripsi" value={item.description} colSpan="full" />
                  </DetailCard>
                )}
                {item.uomConversions.length > 0 && (
                  <DetailSection title="Satuan Alternatif">
                    <DetailTable>
                      <DetailTableHead>
                        <DetailTableTh>Kode Satuan</DetailTableTh>
                        <DetailTableTh align="right">Faktor ke Satuan Dasar ({item.unitOfMeasure})</DetailTableTh>
                      </DetailTableHead>
                      <DetailTableBody>
                        {item.uomConversions.map((u) => (
                          <DetailTableRow key={u.id}>
                            <DetailTableTd>{u.code}</DetailTableTd>
                            <DetailTableTd align="right">{Number(u.factorToBase)}</DetailTableTd>
                          </DetailTableRow>
                        ))}
                      </DetailTableBody>
                    </DetailTable>
                  </DetailSection>
                )}
                {item.itemBatches.length > 0 && (
                  <DetailSection title="Batch/Lot">
                    <DetailTable>
                      <DetailTableHead>
                        <DetailTableTh>No. Batch/Lot</DetailTableTh>
                        <DetailTableTh align="right">Jml</DetailTableTh>
                        <DetailTableTh>Kedaluwarsa</DetailTableTh>
                      </DetailTableHead>
                      <DetailTableBody>
                        {item.itemBatches.map((b) => (
                          <DetailTableRow key={b.id}>
                            <DetailTableTd>{b.batchNumber}</DetailTableTd>
                            <DetailTableTd align="right">{Number(b.qty)} {item.unitOfMeasure}</DetailTableTd>
                            <DetailTableTd>{b.expiryDate ? formatDate(b.expiryDate) : "-"}</DetailTableTd>
                          </DetailTableRow>
                        ))}
                      </DetailTableBody>
                    </DetailTable>
                  </DetailSection>
                )}
                {item.itemSerials.length > 0 && (
                  <DetailSection title="Nomor Seri">
                    <DetailTable>
                      <DetailTableHead>
                        <DetailTableTh>Nomor Seri</DetailTableTh>
                        <DetailTableTh>Status</DetailTableTh>
                      </DetailTableHead>
                      <DetailTableBody>
                        {item.itemSerials.map((s) => (
                          <DetailTableRow key={s.id}>
                            <DetailTableTd>{s.serialNumber}</DetailTableTd>
                            <DetailTableTd><StatusChip status={s.status} /></DetailTableTd>
                          </DetailTableRow>
                        ))}
                      </DetailTableBody>
                    </DetailTable>
                  </DetailSection>
                )}
              </>
            ),
          },
          {
            id: "stok",
            label: "Stok",
            content: (
              <DetailSection title="Lapisan FIFO (Sisa)">
                {item.inventoryLayers.length === 0 ? (
                  <EmptyState title="Tidak ada lapisan aktif" />
                ) : (
                  <DetailTable>
                    <DetailTableHead>
                      <DetailTableTh>Masuk</DetailTableTh>
                      <DetailTableTh align="right">Kuantitas Masuk</DetailTableTh>
                      <DetailTableTh align="right">Kuantitas Keluar</DetailTableTh>
                      <DetailTableTh align="right">Sisa</DetailTableTh>
                      <DetailTableTh align="right">Biaya Satuan</DetailTableTh>
                    </DetailTableHead>
                    <DetailTableBody>
                      {item.inventoryLayers.map((layer) => (
                        <DetailTableRow key={layer.id}>
                          <DetailTableTd>{formatDate(layer.createdAt)}</DetailTableTd>
                          <DetailTableTd align="right">{Number(layer.qtyIn)}</DetailTableTd>
                          <DetailTableTd align="right">{Number(layer.qtyOut)}</DetailTableTd>
                          <DetailTableTd align="right"><strong>{Number(layer.remaining)}</strong></DetailTableTd>
                          <DetailTableTd align="right">{formatCurrency(Number(layer.unitCost))}</DetailTableTd>
                        </DetailTableRow>
                      ))}
                    </DetailTableBody>
                  </DetailTable>
                )}
              </DetailSection>
            ),
          },
          ...(!item.isService
            ? [
                {
                  id: "stok-minimum",
                  label: "Stok Minimum",
                  content: (
                    <ItemWarehouseMinStockPanel
                      itemId={item.id}
                      canManage={canEditItems}
                      overrideLabel={MIN_STOCK_OVERRIDE_LABEL}
                      globalLabel={MIN_STOCK_GLOBAL_LABEL}
                    />
                  ),
                },
              ]
            : []),
          {
            id: "substitusi",
            label: "Substitusi",
            content: (
              <ItemSubstitutesPanel
                itemId={item.id}
                itemOptions={substituteItemOptions.map((o) => ({
                  id: o.id,
                  label: `${o.name} (${o.sku})`,
                }))}
                canManage={canEditItems}
              />
            ),
          },
          {
            id: "transaksi",
            label: "Transaksi",
            content: (
              <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-4 p-4 px-5 border-b border-default">
                  <h2 className="text-[0.9375rem] font-semibold text-foreground">Riwayat Transaksi</h2>
                  <span className="text-xs text-muted-foreground">{stockMovesWithRef.length} transaksi</span>
                </div>
                <div className="p-4 px-5">
                  {stockMovesWithRef.length === 0 ? (
                    <EmptyState title="Belum ada transaksi" />
                  ) : (
                    <DetailTable>
                      <DetailTableHead>
                        <DetailTableTh>Tanggal</DetailTableTh>
                        <DetailTableTh>No. Dokumen</DetailTableTh>
                        <DetailTableTh>Tipe</DetailTableTh>
                        <DetailTableTh>Masuk/Keluar</DetailTableTh>
                        <DetailTableTh align="right">Jml</DetailTableTh>
                        <DetailTableTh align="right">Harga Satuan</DetailTableTh>
                        <DetailTableTh>Pihak</DetailTableTh>
                        <DetailTableTh>Gudang</DetailTableTh>
                      </DetailTableHead>
                      <DetailTableBody>
                        {stockMovesWithRef.map((sm) => (
                          <DetailTableRow key={sm.id}>
                            <DetailTableTd>{formatDate(sm.createdAt)}</DetailTableTd>
                            <DetailTableTd className="font-mono">
                              {sm.docLink ? (
                                <Link href={sm.docLink} className="text-primary hover:underline">{sm.documentNo}</Link>
                              ) : sm.documentNo}
                            </DetailTableTd>
                            <DetailTableTd>
                              <span className="text-xs text-muted-foreground">{formatReferenceType(sm.referenceType || sm.moveType)}</span>
                            </DetailTableTd>
                            <DetailTableTd>
                              <StatusChip status={sm.impact === "IN" ? "received" : "returned"} />
                            </DetailTableTd>
                            <DetailTableTd align="right">{Number(sm.qty)}</DetailTableTd>
                            <DetailTableTd align="right">{formatCurrency(Number(sm.cost))}</DetailTableTd>
                            <DetailTableTd>
                              {sm.partyLabel && <span className="text-xs text-muted-foreground">{sm.partyLabel}: </span>}
                              <span className="text-sm">{sm.party}</span>
                            </DetailTableTd>
                            <DetailTableTd>{sm.warehouse?.name || "-"}</DetailTableTd>
                          </DetailTableRow>
                        ))}
                      </DetailTableBody>
                    </DetailTable>
                  )}
                </div>
              </div>
            ),
          },
        ]}
      />
    </div>
  )
}
