import { Pencil } from "lucide-react"
export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { formatCurrency, formatDate } from "@/lib/utils/format"
import Link from "next/link"
import { notFound } from "next/navigation"
import { DetailTabs } from "@/components/ui/detail-tabs"
import { StatusChip } from "@/components/ui/status-chip"
import { DeleteButton } from "@/components/ui/delete-button"
import { deleteItem } from "@/actions/master.actions"
import { PageHeader, Button, BackButton } from "@/components/ui/page-header"
import { DetailCard, DetailField, DetailSection } from "@/components/ui/detail-card"
import { DetailTable, DetailTableHead, DetailTableTh, DetailTableBody, DetailTableRow, DetailTableTd } from "@/components/ui/detail-table"

export default async function ItemDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requirePermission("view_items")
  const { id } = await params

  const item = await prisma.item.findUnique({
    where: { id: Number(id) },
    include: {
      category: true,
      stockMoves: { orderBy: { createdAt: "desc" }, include: { warehouse: true } },
      inventoryLayers: { where: { remaining: { gt: 0 } }, orderBy: { createdAt: "asc" } },
    },
  })

  if (!item) notFound()

  const isLowStock = Number(item.minStock) > 0 && Number(item.qtyOnHand) <= Number(item.minStock)

  // Resolve references for stock moves (vendor, customer, project)
  const stockMovesWithRef = await Promise.all(
    item.stockMoves.map(async (sm) => {
      let party = "-"
      let partyLabel = ""
      let docLink = ""

      if (sm.referenceType && sm.referenceId) {
        switch (sm.referenceType) {
          case "GoodsReceipt": {
            const gr = await prisma.goodsReceipt.findUnique({ where: { id: sm.referenceId } })
            if (gr) {
              // Resolve vendor via PO
              const po = gr.purchaseOrderId ? await prisma.purchaseOrder.findUnique({ where: { id: gr.purchaseOrderId }, include: { vendor: true } }) : null
              if (po?.vendor) { party = po.vendor.name; partyLabel = "Vendor" }
            }
            docLink = `/purchase/goods-receipts/${sm.referenceId}`
            break
          }
          case "MaterialIssue": {
            const mi = await prisma.materialIssue.findUnique({ where: { id: sm.referenceId } })
            if (mi?.projectId) {
              const proj = await prisma.project.findUnique({ where: { id: mi.projectId } })
              if (proj) { party = proj.name; partyLabel = "Project" }
            } else if (mi?.workOrderId) {
              const wo = await prisma.workOrder.findUnique({ where: { id: mi.workOrderId } })
              if (wo?.projectId) {
                const proj = await prisma.project.findUnique({ where: { id: wo.projectId } })
                if (proj) { party = proj.name; partyLabel = "Project" }
              }
            }
            docLink = `/inventory/material-issues/${sm.referenceId}`
            break
          }
          case "SalesReturn": {
            const sr = await prisma.salesReturn.findUnique({ where: { id: sm.referenceId } })
            if (sr?.customerId) {
              const cust = await prisma.customer.findUnique({ where: { id: sr.customerId } })
              if (cust) { party = cust.name; partyLabel = "Customer" }
            }
            docLink = `/sales/returns/${sm.referenceId}`
            break
          }
          case "PurchaseReturn": {
            const pr = await prisma.purchaseReturn.findUnique({ where: { id: sm.referenceId } })
            if (pr?.purchaseOrderId) {
              const po = await prisma.purchaseOrder.findUnique({ where: { id: pr.purchaseOrderId }, include: { vendor: true } })
              if (po?.vendor) { party = po.vendor.name; partyLabel = "Vendor" }
            }
            docLink = `/purchase/returns/${sm.referenceId}`
            break
          }
          case "StockAdjustment": {
            partyLabel = "Internal"
            party = "Penyesuaian Stok"
            docLink = `/inventory/adjustments/${sm.referenceId}`
            break
          }
          case "InventoryTransfer": {
            partyLabel = "Internal"
            party = "Transfer Gudang"
            docLink = `/inventory/transfers/${sm.referenceId}`
            break
          }
          case "WorkOrder": {
            const wo = await prisma.workOrder.findUnique({ where: { id: sm.referenceId } })
            if (wo?.projectId) {
              const proj = await prisma.project.findUnique({ where: { id: wo.projectId } })
              if (proj) { party = proj.name; partyLabel = "Project" }
            } else {
              partyLabel = "Produksi"
              party = "Work Order"
            }
            docLink = `/manufacturing/work-orders/${sm.referenceId}`
            break
          }
        }
      }

      return { ...sm, party, partyLabel, docLink }
    })
  )

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={item.name}
        breadcrumbs={[
          { label: "Dashboard", href: "/" },
          { label: "Master Data", href: "/master" },
          { label: "Items", href: "/master/items" },
          { label: "Detail" },
        ]}
        badge={item.isProduct ? (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary">Produk</span>
        ) : undefined}
        actions={
          <>
            <Button href={`/master/items/${id}/edit`} variant="secondary"><Pencil size={14} /> Edit</Button>
            <DeleteButton id={item.id} action={deleteItem} />
            <BackButton href="/master/items" />
          </>
        }
      />

      <DetailTabs
        ariaLabel="Item detail tabs"
        tabs={[
          {
            id: "info",
            label: "Info",
            content: (
              <>
                <DetailCard>
                  <DetailField label="SKU" value={item.sku} mono />
                  <DetailField label="Kategori" value={item.category?.name || "-"} />
                  <DetailField label="Satuan" value={item.unitOfMeasure} />
                  <DetailField label="Stok Saat Ini" value={
                    <span className={isLowStock ? "text-danger" : ""}>
                      {Number(item.qtyOnHand)} {item.unitOfMeasure}
                      {isLowStock && " ⚠️"}
                    </span>
                  } />
                  <DetailField label="Minimum Stok" value={String(Number(item.minStock))} />
                  <DetailField label="Harga Beli" value={formatCurrency(Number(item.cost))} />
                  <DetailField label="Harga Jual" value={formatCurrency(Number(item.price))} />
                  <DetailField label="Nilai Stok" value={formatCurrency(Number(item.qtyOnHand) * Number(item.cost))} />
                </DetailCard>
                {item.description && (
                  <DetailCard>
                    <DetailField label="Deskripsi" value={item.description} colSpan="full" />
                  </DetailCard>
                )}
              </>
            ),
          },
          {
            id: "stok",
            label: "Stok",
            content: (
              <DetailSection title="FIFO Layers (Sisa)">
                {item.inventoryLayers.length === 0 ? (
                  <p className="flex flex-col items-center justify-center py-16 text-center text-muted">Tidak ada layer aktif</p>
                ) : (
                  <DetailTable>
                    <DetailTableHead>
                      <DetailTableTh>Masuk</DetailTableTh>
                      <DetailTableTh align="right">Qty In</DetailTableTh>
                      <DetailTableTh align="right">Qty Out</DetailTableTh>
                      <DetailTableTh align="right">Sisa</DetailTableTh>
                      <DetailTableTh align="right">Unit Cost</DetailTableTh>
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
          {
            id: "transaksi",
            label: "Transaksi",
            content: (
              <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
                <div className="flex items-center justify-between p-4 px-5 border-b border-default">
                  <h2 className="text-[0.9375rem] font-semibold text-foreground">Riwayat Transaksi</h2>
                  <span className="text-xs text-muted">{stockMovesWithRef.length} transaksi</span>
                </div>
                <div className="p-4 px-5">
                  {stockMovesWithRef.length === 0 ? (
                    <p className="flex flex-col items-center justify-center py-16 text-center text-muted">Belum ada transaksi</p>
                  ) : (
                    <DetailTable>
                      <DetailTableHead>
                        <DetailTableTh>Tanggal</DetailTableTh>
                        <DetailTableTh>No. Dokumen</DetailTableTh>
                        <DetailTableTh>Tipe</DetailTableTh>
                        <DetailTableTh>Masuk/Keluar</DetailTableTh>
                        <DetailTableTh align="right">Qty</DetailTableTh>
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
                              <span className="text-xs text-muted">{sm.referenceType || sm.moveType || "-"}</span>
                            </DetailTableTd>
                            <DetailTableTd>
                              <StatusChip status={sm.impact === "IN" ? "received" : "returned"} />
                            </DetailTableTd>
                            <DetailTableTd align="right">{Number(sm.qty)}</DetailTableTd>
                            <DetailTableTd align="right">{formatCurrency(Number(sm.cost))}</DetailTableTd>
                            <DetailTableTd>
                              {sm.partyLabel && <span className="text-xs text-muted">{sm.partyLabel}: </span>}
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
