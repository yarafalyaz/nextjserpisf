export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { formatCurrency, formatDate } from "@/lib/utils/format"
import Link from "next/link"
import { notFound } from "next/navigation"
import { StatusChip } from '@/components/ui/status-chip'
import { DeleteButton } from "@/components/ui/delete-button"
import { deleteProductionOrder } from "@/actions/manufacturing.actions"
import { ProductionOrderActions } from "../_components/production-order-actions"
import { ProductionCostSection } from "../_components/production-cost-section"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { DetailTable, DetailTableHead, DetailTableTh, DetailTableBody, DetailTableRow, DetailTableTd } from "@/components/ui/detail-table"

import type { Metadata } from "next"

import { requirePermission } from "@/lib/auth/permissions"
export const metadata: Metadata = { title: "Production Orders" }

export default async function ProductionOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const user = await requirePermission("view_production")
  const canManageCosts =
    user.roles.includes("super_admin") || user.permissions.includes("manage_production_costs")

  const { id } = await params
  const numId = Number(id)
  if (Number.isNaN(numId)) notFound()

  const order = await prisma.productionOrder.findUnique({
    where: { id: numId },
    include: {
      product: { include: { inventoryItem: { select: { trackSerial: true } } } },
      materials: true,
      costs: {
        orderBy: { createdAt: "asc" },
        include: { vendor: { select: { name: true } } },
      },
      genealogy: {
        include: { materials: true },
      },
    },
  })

  if (!order) notFound()

  // Resolve item names for genealogy materials.
  const geneItemIds = order.genealogy?.materials.map((m) => m.itemId) ?? []
  const geneItemRows = geneItemIds.length
    ? await prisma.item.findMany({
        where: { id: { in: geneItemIds } },
        select: { id: true, name: true, sku: true },
      })
    : []
  const geneItemMap = new Map(geneItemRows.map((i) => [i.id, i]))

  // Link to a work order (if any) so labor cost can be pulled from its project's
  // timesheets. A production order is not directly tied to a project or WO, so
  // this is a best-effort link via the product's inventory item on WO items.
  const linkedWorkOrder = order.product.inventoryItemId
    ? await prisma.workOrder.findFirst({
        where: { items: { some: { itemId: order.product.inventoryItemId } } },
        select: { id: true, projectId: true },
        orderBy: { createdAt: "desc" },
      })
    : null

  const costRows = order.costs.map((c) => ({
    id: c.id,
    category: c.category,
    description: c.description,
    hours: c.hours != null ? Number(c.hours) : null,
    rate: c.rate != null ? Number(c.rate) : null,
    amount: Number(c.amount),
    referenceNo: c.referenceNo,
    sourceTimesheetId: c.sourceTimesheetId,
    vendorName: c.vendor?.name ?? null,
  }))

  // Resolve material item names (ProductionOrderMaterial holds itemId only).
  const itemIds = order.materials.map((m) => m.itemId)
  const itemRows = itemIds.length
    ? await prisma.item.findMany({
        where: { id: { in: itemIds } },
        select: { id: true, name: true, sku: true },
      })
    : []
  const itemNameMap = new Map(itemRows.map((i) => [i.id, i.name]))
  // Items selectable for material issue = the BOM materials of this order.
  const issuableItems = order.materials.map((m) => ({
    id: m.itemId,
    label: `${itemNameMap.get(m.itemId) ?? `Item #${m.itemId}`}`,
  }))

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dasbor", href: "/" },
  { label: "Manufaktur", href: "/produksi" },
  { label: "Perintah Produksi", href: "/produksi/production-orders" },
  { label: "Detail" },
]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Perintah Produksi {order.documentNo}</h1>
        <div className="flex gap-2 items-center">
          <StatusChip status={order.status} />
  <div className="flex gap-2">
          <ProductionOrderActions
            orderId={order.id}
            status={order.status}
            items={issuableItems}
            outputQty={Number(order.qty)}
            outputTracksSerial={order.product.inventoryItem?.trackSerial ?? false}
          />
          <Link href={`/produksi/production-orders/${order.id}/ubah`} className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all">Ubah</Link>
          <DeleteButton id={order.id} action={deleteProductionOrder} />
                  <Link href="/produksi/production-orders" className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:bg-surface-secondary hover:text-foreground transition-all">← Kembali</Link>
        </div>
        </div>
      </div>

      <div className="bg-surface rounded-xl border border-default shadow-sm p-6">
        <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">No. Dokumen</span>
            <span className="text-[0.9375rem] text-foreground font-medium font-mono">{order.documentNo}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Produk</span>
            <span className="text-[0.9375rem] text-foreground font-medium">{order.product.name}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Jml</span>
            <span className="text-[0.9375rem] text-foreground font-medium">{Number(order.qty)}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Status</span>
            <span className="text-[0.9375rem] text-foreground font-medium"><StatusChip status={order.status} /></span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Dibuat</span>
            <span className="text-[0.9375rem] text-foreground font-medium">{formatDate(order.createdAt)}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Biaya Standar</span>
            <span className="text-[0.9375rem] text-foreground font-medium">{formatCurrency(Number(order.totalStandardCost))}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Biaya Aktual</span>
            <span className="text-[0.9375rem] text-foreground font-medium">{formatCurrency(Number(order.totalActualCost))}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Varians</span>
            <span className={`text-[0.9375rem] font-semibold ${Number(order.variance) > 0 ? "text-danger" : Number(order.variance) < 0 ? "text-success" : "text-foreground"}`}>
              {formatCurrency(Number(order.variance))}
            </span>
          </div>
        </div>
      </div>

      {/* Materials */}
      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
        <div className="flex items-center justify-between p-4 px-5 border-b border-default">
          <h2 className="text-[0.9375rem] font-semibold text-foreground">Material yang Dibutuhkan</h2>
        </div>
        <div className="p-4 px-5">
          {order.materials.length === 0 ? (
            <p className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">Tidak ada material</p>
          ) : (
            <DetailTable>
              <DetailTableHead>
                <DetailTableTh>Barang</DetailTableTh>
                <DetailTableTh align="right">Qty Rencana</DetailTableTh>
                <DetailTableTh align="right">Qty Aktual</DetailTableTh>
                <DetailTableTh align="right">Biaya Standar</DetailTableTh>
                <DetailTableTh align="right">Biaya Aktual</DetailTableTh>
              </DetailTableHead>
              <DetailTableBody>
                {order.materials.map((mat) => (
                  <DetailTableRow key={mat.id}>
                    <DetailTableTd>{itemNameMap.get(mat.itemId) ?? `Item #${mat.itemId}`}</DetailTableTd>
                    <DetailTableTd align="right">{Number(mat.qty)}</DetailTableTd>
                    <DetailTableTd align="right">{Number(mat.actualQty ?? 0)}</DetailTableTd>
                    <DetailTableTd align="right">{formatCurrency(Number(mat.standardCost))}</DetailTableTd>
                    <DetailTableTd align="right">{formatCurrency(Number(mat.actualCost))}</DetailTableTd>
                  </DetailTableRow>
                ))}
              </DetailTableBody>
            </DetailTable>
          )}
        </div>
      </div>

      {/* Non-material costs (labor / overhead / subcontract / service) */}
      <ProductionCostSection
        productionOrderId={order.id}
        workOrderId={linkedWorkOrder?.id ?? null}
        costs={costRows}
        canManage={canManageCosts}
        hasProject={!!linkedWorkOrder?.projectId}
      />

      {/* Production genealogy (PRD line 369 / REP-13) */}
      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
        <div className="flex items-center justify-between p-4 px-5 border-b border-default">
          <h2 className="text-[0.9375rem] font-semibold text-foreground">Genealogi Produksi</h2>
        </div>
        <div className="p-4 px-5">
          {!order.genealogy ? (
            <p className="flex flex-col items-center justify-center py-10 text-center text-muted-foreground">
              Genealogi tercatat saat perintah produksi diselesaikan — unit hasil beserta material yang dipakai.
            </p>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-4">
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Unit Hasil</span>
                  <span className="text-[0.9375rem] text-foreground font-medium">{order.product.name}</span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Qty</span>
                  <span className="text-[0.9375rem] text-foreground font-medium">{Number(order.genealogy.outputQty)}</span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Batch</span>
                  <span className="text-[0.9375rem] text-foreground font-medium font-mono">{order.genealogy.outputBatch ?? "-"}</span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Diselesaikan</span>
                  <span className="text-[0.9375rem] text-foreground font-medium">{formatDate(order.genealogy.completedAt)}</span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">HPP / Unit</span>
                  <span className="text-[0.9375rem] text-foreground font-medium">{formatCurrency(Number(order.genealogy.unitCost))}</span>
                </div>
              </div>

              {(order.genealogy.outputSerials as string[] | null)?.length ? (
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Serial Hasil</span>
                  <span className="text-sm text-foreground font-mono">
                    {((order.genealogy.outputSerials as string[]) ?? []).join(", ")}
                  </span>
                </div>
              ) : null}

              <div>
                <h3 className="text-sm font-semibold text-foreground mb-2">Material yang Dipakai</h3>
                {order.genealogy.materials.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Tidak ada material tercatat.</p>
                ) : (
                  <DetailTable>
                    <DetailTableHead>
                      <DetailTableTh>Barang</DetailTableTh>
                      <DetailTableTh align="right">Qty</DetailTableTh>
                      <DetailTableTh align="right">Biaya Satuan</DetailTableTh>
                      <DetailTableTh align="right">Total</DetailTableTh>
                    </DetailTableHead>
                    <DetailTableBody>
                      {order.genealogy.materials.map((m) => (
                        <DetailTableRow key={m.id}>
                          <DetailTableTd>
                            {geneItemMap.get(m.itemId)
                              ? `${geneItemMap.get(m.itemId)!.sku} — ${geneItemMap.get(m.itemId)!.name}`
                              : `Item #${m.itemId}`}
                          </DetailTableTd>
                          <DetailTableTd align="right">{Number(m.qty)}</DetailTableTd>
                          <DetailTableTd align="right">{formatCurrency(Number(m.unitCost))}</DetailTableTd>
                          <DetailTableTd align="right">{formatCurrency(Number(m.totalCost))}</DetailTableTd>
                        </DetailTableRow>
                      ))}
                    </DetailTableBody>
                  </DetailTable>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
