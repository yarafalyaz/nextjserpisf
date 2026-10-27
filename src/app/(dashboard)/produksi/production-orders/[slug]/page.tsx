export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { formatCurrency, formatDate } from "@/lib/utils/format"
import Link from "next/link"
import { notFound } from "next/navigation"
import { StatusChip } from '@/components/ui/status-chip'
import { DeleteButton } from "@/components/ui/delete-button"
import { deleteProductionOrder } from "@/actions/manufacturing.actions"
import { ProductionOrderActions } from "../_components/production-order-actions"
import { JobReopenButton } from "@/components/reports/job-reopen-button"
import { ProductionCostSection } from "../_components/production-cost-section"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { DetailTable, DetailTableHead, DetailTableTh, DetailTableBody, DetailTableRow, DetailTableTd } from "@/components/ui/detail-table"

import type { Metadata } from "next"
import { resolveEntity } from "@/lib/utils/resolve-entity"
import { entityHref, entityEditHref } from "@/lib/utils/entity-url"

import { requirePermission, hasPermission } from "@/lib/auth/permissions"
import { auth } from "@/lib/auth/auth"
import { buildProductionVariance } from "@/lib/reports/production-variance"
import { CanCreate } from "@/components/auth/can-create"
import { listBomRevisionChangeRequests } from "@/actions/bom-revision-change.actions"
import { BomRevisionChangePanel } from "@/components/reports/bom-revision-change-panel"
import { BomRevisionImpactCard } from "@/components/reports/bom-revision-impact-card"
import { loadBomRevisionImpact } from "@/lib/reports/bom-revision-impact-data"
import { completedByLabel, genealogyMaterialTokens } from "@/lib/reports/genealogy-forward-trace"
export const metadata: Metadata = { title: "Perintah Produksi" }

export default async function ProductionOrderDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const user = await requirePermission("view_production_orders")
  const canManageCosts =
    user.roles.includes("super_admin") || user.permissions.includes("manage_production_costs")

  const { slug } = await params

  const workOrderPinSelect = { id: true, documentNo: true, projectId: true, slug: true, bomRevision: { select: { revisionNo: true } } }

  const productionOrderInclude = {
    product: { include: { inventoryItem: { select: { trackSerial: true } } } },
    bomRevision: { select: { id: true, revisionNo: true, slug: true } },
    workOrder: { select: workOrderPinSelect },
    materials: true,
    costs: {
      orderBy: { createdAt: "asc" as const },
      include: {
        vendor: { select: { name: true } },
        purchaseOrder: { select: { id: true, documentNo: true, slug: true } },
        nonconformance: { select: { id: true, documentNo: true, slug: true } },
      },
    },
    genealogy: {
      include: { materials: true },
    },
  }

  const order = await resolveEntity(
    { segment: slug },
    {
      bySlug: (s) =>
        prisma.productionOrder.findFirst({
          where: { slug: s },
          include: productionOrderInclude,
        }),
      byId: (id) =>
        prisma.productionOrder.findUnique({
          where: { id },
          include: productionOrderInclude,
        }),
    },
  )

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

  // `completedBy` hanya kolom Int tanpa relasi User — resolve namanya di sini.
  const completedByUser =
    order.genealogy?.completedBy != null
      ? await prisma.user.findUnique({
          where: { id: order.genealogy.completedBy },
          select: { id: true, name: true },
        })
      : null
  const completedByName = completedByLabel(
    order.genealogy?.completedBy,
    new Map(completedByUser ? [[completedByUser.id, completedByUser.name]] : []),
  )

  // The production order now carries a real workOrderId FK (see migration
  // 20261008130000_integration_relations); fall back to the legacy best-effort
  // item match only for older orders created before the link existed.
  const linkedWorkOrder = order.workOrder
    ?? (order.product.inventoryItemId
      ? await prisma.workOrder.findFirst({
          where: { items: { some: { itemId: order.product.inventoryItemId } } },
          select: workOrderPinSelect,
          orderBy: { createdAt: "desc" },
        })
      : null)

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
    vendorId: c.vendorId ?? null,
    purchaseOrderId: c.purchaseOrderId,
    purchaseOrderNo: c.purchaseOrder?.documentNo ?? null,
    purchaseOrderSlug: c.purchaseOrder?.slug ?? null,
    nonconformanceId: c.nonconformanceId,
    nonconformanceNo: c.nonconformance?.documentNo ?? null,
    nonconformanceSlug: c.nonconformance?.slug ?? null,
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
    label: `${itemNameMap.get(m.itemId) ?? `Barang #${m.itemId}`}`,
  }))

  // F-068-S UI (t_b60d664d): panel ganti revisi BOM — konsumen aksi BOT 3
  // PR #589. Opsi = revisi released produk PO ini (beda dari pin).
  const [bomChangeList, canManageBomChange, bomSession] = await Promise.all([
    listBomRevisionChangeRequests({ productionOrderId: order.id }),
    hasPermission("edit_production_orders"),
    auth(),
  ])
  const bomChangeRequests = bomChangeList.success ? bomChangeList.requests : []
  // F-2026-10-21-009-V: izin tombol reopen job closed = izin server reopenProductionOrder.
  const canReopenProductionOrder = await hasPermission("edit_production_orders")
  const bomRevisionOptions = order.bomRevision
    ? await prisma.bomRevision.findMany({
        where: {
          productId: order.productId,
          status: "released",
          id: { not: order.bomRevision.id },
        },
        select: { id: true, revisionNo: true },
        orderBy: { revisionNo: "asc" },
      })
    : []
  const bomRevIds = [
    ...new Set([
      ...(order.bomRevision ? [order.bomRevision.id] : []),
      ...bomRevisionOptions.map((r) => r.id),
      ...bomChangeRequests.flatMap((r) => [r.fromRevisionId, r.toRevisionId]),
    ]),
  ]
  const bomRevRows = bomRevIds.length
    ? await prisma.bomRevision.findMany({
        where: { id: { in: bomRevIds } },
        select: { id: true, revisionNo: true, materials: { select: { itemId: true } } },
      })
    : []
  const bomUserIds = [
    ...new Set(
      bomChangeRequests.flatMap((r) => [r.requestedBy, r.decidedBy]).filter((x): x is number => x != null),
    ),
  ]
  const bomUserRows = bomUserIds.length
    ? await prisma.user.findMany({ where: { id: { in: bomUserIds } }, select: { id: true, name: true } })
    : []
  const bomItemIds = [...new Set(bomRevRows.flatMap((r) => r.materials.map((m) => m.itemId)))]
  const bomItemRows = bomItemIds.length
    ? await prisma.item.findMany({ where: { id: { in: bomItemIds } }, select: { id: true, name: true } })
    : []

  const productionVariance = buildProductionVariance({
    orders: [
      {
        id: order.id,
        documentNo: order.documentNo,
        date: order.createdAt,
        status: order.status,
        productName: order.product.name,
        totalStandardCost: Number(order.totalStandardCost),
        totalActualCost: Number(order.totalActualCost),
        releasedCost: Number(order.releasedCost),
        recordedVariance: Number(order.variance),
        materials: order.materials.map((m) => ({
          itemId: m.itemId,
          qty: Number(m.qty),
          actualQty: m.actualQty === null ? null : Number(m.actualQty),
          standardCost: Number(m.standardCost),
          actualCost: Number(m.actualCost),
        })),
        costs: order.costs.map((c) => ({ category: c.category, amount: Number(c.amount) })),
      },
    ],
    start: order.createdAt,
    end: order.createdAt,
  }).orders[0]

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dasbor", href: "/" },
  { label: "Manufaktur", href: "/produksi" },
  { label: "Perintah Produksi", href: "/produksi/production-orders" },
  { label: "Detail" },
]} />
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">Perintah Produksi {order.documentNo}</h1>
        <div className="flex gap-2 items-center">
          <StatusChip status={order.status} />
  <div className="flex gap-2">
          <JobReopenButton
            kind="production_order"
            id={order.id}
            code={order.documentNo}
            status={order.status}
            canReopen={canReopenProductionOrder}
          />
          <ProductionOrderActions
            orderId={order.id}
            status={order.status}
            items={issuableItems}
            outputQty={Number(order.qty)}
            outputTracksSerial={order.product.inventoryItem?.trackSerial ?? false}
            completedQty={Number(order.completedQty ?? 0)}
          />
          <CanCreate permission="edit_production_orders">
            <Link href={entityEditHref("/produksi/production-orders", order)} className="inline-flex items-center justify-center gap-1.5 w-full sm:w-auto px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all">Ubah</Link>
          </CanCreate>
          <CanCreate permission="delete_production_orders">
            <DeleteButton id={order.id} action={deleteProductionOrder} />
          </CanCreate>
                  <Link href="/produksi/production-orders" className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:bg-surface-secondary hover:text-foreground transition-all">← Kembali</Link>
        </div>
        </div>
      </div>

      <div className="bg-surface rounded-xl border border-default shadow-sm p-4 sm:p-6">
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
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Revisi BOM</span>
            <span className="text-[0.9375rem] text-foreground font-medium">
              {order.bomRevision ? (
                <Link href={entityHref("/produksi/bom-revisi", order.bomRevision)} className="hover:underline">
                  Rev. {order.bomRevision.revisionNo}
                </Link>
              ) : "-"}
            </span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Perintah Kerja</span>
            <span className="text-[0.9375rem] text-foreground font-medium">
              {linkedWorkOrder ? (
                <Link href={entityHref("/produksi/perintah-kerja", linkedWorkOrder)} className="hover:underline">
                  {linkedWorkOrder.documentNo ?? `WO #${linkedWorkOrder.id}`}
                </Link>
              ) : "-"}
            </span>
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

      {productionVariance ? (
        <section aria-labelledby="varians-produksi-heading" className="bg-surface rounded-xl border border-default shadow-sm p-4 sm:p-6">
          <h2 id="varians-produksi-heading" className="text-[0.9375rem] font-semibold text-foreground">Varians Produksi</h2>
          <div className="mt-4 grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Selisih Harga Bahan</span>
              <span className="text-[0.9375rem] text-foreground font-medium">{formatCurrency(productionVariance.materialPriceVariance)}</span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Selisih Pemakaian</span>
              <span className="text-[0.9375rem] text-foreground font-medium">{formatCurrency(productionVariance.materialUsageVariance)}</span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Tenaga Kerja & Lainnya</span>
              <span className="text-[0.9375rem] text-foreground font-medium">{formatCurrency(productionVariance.laborAndOtherCost)}</span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Varians %</span>
              <span className="text-[0.9375rem] text-foreground font-medium">
                {productionVariance.variancePct === null ? "–" : `${new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 }).format(productionVariance.variancePct)}%`}
              </span>
            </div>
          </div>
          {productionVariance.uncalibratedLines > 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">
              {productionVariance.uncalibratedLines} baris bahan tanpa standar terkalibrasi — selisihnya tidak dijurnalkan sebagai disposisi.
            </p>
          ) : null}
        </section>
      ) : null}

      {/* Materials */}
      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-4 p-4 px-5 border-b border-default">
          <h2 className="text-[0.9375rem] font-semibold text-foreground">Bahan yang Dibutuhkan</h2>
        </div>
        <div className="p-4 px-5">
          {order.materials.length === 0 ? (
            <p className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">Tidak ada bahan</p>
          ) : (
            <DetailTable>
              <DetailTableHead>
                <DetailTableTh>Barang</DetailTableTh>
                <DetailTableTh align="right">Kuantitas Rencana</DetailTableTh>
                <DetailTableTh align="right">Kuantitas Aktual</DetailTableTh>
                <DetailTableTh align="right">Biaya Standar</DetailTableTh>
                <DetailTableTh align="right">Biaya Aktual</DetailTableTh>
              </DetailTableHead>
              <DetailTableBody>
                {order.materials.map((mat) => (
                  <DetailTableRow key={mat.id}>
                    <DetailTableTd>{itemNameMap.get(mat.itemId) ?? `Barang #${mat.itemId}`}</DetailTableTd>
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

      {order.bomRevision ? (
        <BomRevisionImpactCard
          impact={await loadBomRevisionImpact(order.bomRevision.id)}
          currentRevisionNo={order.bomRevision.revisionNo}
        />
      ) : null}

      <BomRevisionChangePanel
        owner={{ productionOrderId: order.id }}
        documentStatus={order.status}
        currentRevision={order.bomRevision}
        revisionOptions={bomRevisionOptions}
        requests={bomChangeRequests}
        revisionNoById={Object.fromEntries(bomRevRows.map((r) => [r.id, r.revisionNo]))}
        userNameById={Object.fromEntries(bomUserRows.map((u) => [u.id, u.name]))}
        itemNameById={Object.fromEntries(bomItemRows.map((i) => [i.id, i.name]))}
        canManage={canManageBomChange}
        currentUserId={bomSession?.user?.id ? Number(bomSession.user.id) : null}
        pairedPins={
          linkedWorkOrder?.bomRevision
            ? [{ label: "perintah kerja", documentNo: linkedWorkOrder.documentNo, revisionNo: linkedWorkOrder.bomRevision.revisionNo }]
            : []
        }
      />

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
        <div className="flex flex-wrap items-center justify-between gap-4 p-4 px-5 border-b border-default">
          <h2 className="text-[0.9375rem] font-semibold text-foreground">Genealogi Produksi</h2>
        </div>
        <div className="p-4 px-5">
          {!order.genealogy ? (
            <p className="flex flex-col items-center justify-center py-10 text-center text-muted-foreground">
              Genealogi tercatat saat perintah produksi diselesaikan — unit hasil beserta bahan yang dipakai.
            </p>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-4">
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Unit Hasil</span>
                  <span className="text-[0.9375rem] text-foreground font-medium">{order.product.name}</span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Kuantitas</span>
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
                {completedByName ? (
                  <div className="flex flex-col gap-1">
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Diselesaikan Oleh</span>
                    <span className="text-[0.9375rem] text-foreground font-medium">{completedByName}</span>
                  </div>
                ) : null}
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">HPP / Unit</span>
                  <span className="text-[0.9375rem] text-foreground font-medium">{formatCurrency(Number(order.genealogy.unitCost))}</span>
                </div>
              </div>

              {(order.genealogy.outputSerials as string[] | null)?.length ? (
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Nomor Seri Hasil</span>
                  <span className="text-sm text-foreground font-mono">
                    {((order.genealogy.outputSerials as string[]) ?? []).join(", ")}
                  </span>
                </div>
              ) : null}

              <div>
                <h3 className="text-sm font-semibold text-foreground mb-2">Bahan yang Dipakai</h3>
                {order.genealogy.materials.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Tidak ada bahan tercatat.</p>
                ) : (
                  <DetailTable>
                    <DetailTableHead>
                      <DetailTableTh>Barang</DetailTableTh>
                      <DetailTableTh align="right">Kuantitas</DetailTableTh>
                      <DetailTableTh>Lot/Nomor Seri</DetailTableTh>
                      <DetailTableTh align="right">Biaya Satuan</DetailTableTh>
                      <DetailTableTh align="right">Total</DetailTableTh>
                    </DetailTableHead>
                    <DetailTableBody>
                      {order.genealogy.materials.map((m) => {
                        const tokens = genealogyMaterialTokens(m)
                        return (
                          <DetailTableRow key={m.id}>
                            <DetailTableTd>
                              {geneItemMap.get(m.itemId)
                                ? `${geneItemMap.get(m.itemId)!.sku} — ${geneItemMap.get(m.itemId)!.name}`
                                : `Barang #${m.itemId}`}
                            </DetailTableTd>
                            <DetailTableTd align="right">{Number(m.qty)}</DetailTableTd>
                            <DetailTableTd>
                              {tokens.length ? (
                                <span className="font-mono text-xs">
                                  {tokens.map((token, i) => (
                                    <span key={token}>
                                      {i > 0 ? ", " : null}
                                      <Link href={`/produksi/telusur-genealogi?cari=${encodeURIComponent(token)}`} className="hover:underline" title="Telusur hasil jadi yang memakai lot/serial ini">
                                        {token}
                                      </Link>
                                    </span>
                                  ))}
                                </span>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </DetailTableTd>
                            <DetailTableTd align="right">{formatCurrency(Number(m.unitCost))}</DetailTableTd>
                            <DetailTableTd align="right">{formatCurrency(Number(m.totalCost))}</DetailTableTd>
                          </DetailTableRow>
                        )
                      })}
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
