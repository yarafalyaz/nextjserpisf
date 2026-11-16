import { Plus } from "@/components/ui/fontawesome-icons";
export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { hasPermission, requirePermission } from "@/lib/auth/permissions"
import { resolveEntity } from "@/lib/utils/resolve-entity"
import { entityHref, entityEditHref } from "@/lib/utils/entity-url"
import { formatCurrencyExact, formatDate } from "@/lib/utils/format"
import { DRAFT_ONLY_EDIT_STATUSES } from "@/lib/constants/status"
import Link from "next/link"
import { notFound } from "next/navigation"
import { StatusChip } from "@/components/ui/status-chip"
import { DetailTabs } from "@/components/ui/detail-tabs"
import { DeleteButton } from "@/components/ui/delete-button"
import { VoidButton } from "@/components/ui/void-button"
import { cancelPurchaseOrder, deletePurchaseOrder } from "@/actions/purchase.actions"
import { StatusActions } from "@/components/ui/status-actions"
import { PrintButton } from "@/components/ui/print-button"
import { PageHeader } from "@/components/ui/page-header"
import { Button } from "@/components/ui/button"
import { CanCreate } from "@/components/auth/can-create"
import { DetailCard, DetailField } from "@/components/ui/detail-card"
import {
  PurchaseOrderBillsTable,
  PurchaseOrderItemsTable,
  PurchaseOrderReceiptsTable,
  PurchaseOrderReturnsTable,
} from "./_components/purchase-order-detail-tables"
import { EmptyState } from "@/components/ui/empty-state"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Pesanan" }

export default async function PurchaseOrderDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  await requirePermission("view_purchase_orders")
  const [canApprove, canEdit, canDelete] = await Promise.all([
    hasPermission("approve_purchase_orders"),
    hasPermission("edit_purchase_orders"),
    hasPermission("delete_purchase_orders"),
  ])
  const canCancelPurchaseOrder = await hasPermission("edit_purchase_orders")
  const { slug } = await params
  const po = await resolveEntity(
    { segment: slug, fallbackWhere: {} },
    {
      bySlug: (s, where) =>
        prisma.purchaseOrder.findFirst({
          where: { slug: s, ...where },
          include: {
            vendor: true,
            purchaseRequest: true,
            items: true,
            goodsReceipts: { include: { items: true } },
            purchaseReturns: { include: { items: true } },
            workOrder: { select: { id: true, slug: true, documentNo: true } },
            vendorBills: { where: { status: { notIn: ["cancelled"] } }, select: { id: true, slug: true, documentNo: true, grandTotal: true } },
          },
        }),
      byId: (id, where) =>
        prisma.purchaseOrder.findUnique({
          where: { id, ...where },
          include: {
            vendor: true,
            purchaseRequest: true,
            items: true,
            goodsReceipts: { include: { items: true } },
            purchaseReturns: { include: { items: true } },
            workOrder: { select: { id: true, slug: true, documentNo: true } },
            vendorBills: { where: { status: { notIn: ["cancelled"] } }, select: { id: true, slug: true, documentNo: true, grandTotal: true } },
          },
        }),
    },
  )

  if (!po) notFound()

  // Satu-satunya status yang menerima edit/hapus (lihat updatePurchaseOrder /
  // deletePurchaseOrder). PO posted dikoreksi lewat cancelPurchaseOrder.
  const isDraft = (DRAFT_ONLY_EDIT_STATUSES as readonly string[]).includes(po.status)

  // Fetch item names dynamically
  const itemIds = po.items.map((i) => i.itemId)
  const items = await prisma.item.findMany({
    where: { id: { in: itemIds } },
    select: { id: true, name: true },
  })
  const itemNameMap = new Map(items.map((i) => [i.id, i.name]))

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`PO ${po.documentNo}`}
        breadcrumbs={[
          { label: "Dasbor", href: "/" },
          { label: "Pembelian", href: "/pembelian" },
          { label: "Pesanan", href: "/pembelian/pesanan" },
          { label: "Detail" },
        ]}
        badge={<StatusChip status={po.status} />}
        actions={
          <>
            {/* updatePurchaseOrder/deletePurchaseOrder menolak selain draft.
                Menampilkan Ubah/Hapus pada PO posted membuat operator mengira
                PO bisa dikoreksi langsung; jalurnya cancelPurchaseOrder. */}
            {canEdit && isDraft && <Button href={entityEditHref("/pembelian/pesanan", po)} variant="primary" className="min-h-11 sm:min-h-9">Ubah</Button>}
            {po.vendorBills.length === 0 &&
              (po.isService
                ? !["draft", "cancelled", "rejected"].includes(po.status)
                : po.goodsReceipts.some((gr) => ["verified", "completed"].includes(gr.status))) && (
              <CanCreate permission="create_vendor_bills">
                <Button href={`/pembelian/tagihan/tambah/po/${po.slug ?? po.id}`}>
                  {po.isService ? "Buat Tagihan Jasa" : "Buat Tagihan"}
                </Button>
              </CanCreate>
            )}
            <PrintButton documentType="purchase-order" documentId={po.id} />
            {/* Status yang sama dengan penjagaan di cancelPurchaseOrder: tombol tak
                muncul di tempat yang aksinya pasti menolak. */}
            {!["received", "cancelled", "partial_received"].includes(po.status) && (
              <VoidButton id={po.id} action={cancelPurchaseOrder} canVoid={canCancelPurchaseOrder} />
            )}
            {canDelete && isDraft && <DeleteButton id={po.id} action={deletePurchaseOrder} />}
          </>
        }
      />

      <DetailTabs
        ariaLabel="Tab detail pesanan pembelian"
        tabs={[
          {
            id: "info",
            label: "Info",
            content: (
              <>
                <StatusActions
                  status={po.status}
                  id={po.id}
                  module="pembelian/pesanan"
                  canAct={canApprove}
                />
                <DetailCard>
                  <DetailField label="Pemasok" value={po.vendor.name} />
                  <DetailField label="Tanggal PO" value={formatDate(po.date)} />
                  <DetailField label="Tanggal Diharapkan" value={formatDate(po.expectedDate)} />
                  <DetailField
                    label="Permintaan Pembelian (PR)"
                    value={
                      po.purchaseRequest ? (
                        <Link href={entityHref("/pembelian/permintaan", po.purchaseRequest)} className="text-primary hover:underline font-mono">
                          {po.purchaseRequest.documentNo}
                        </Link>
                      ) : (
                        "-"
                      )
                    }
                  />
                  <DetailField
                    label={po.isService ? "Perintah Kerja (Jasa)" : "Perintah Kerja"}
                    value={
                      po.workOrder ? (
                        <Link href={entityHref("/produksi/perintah-kerja", po.workOrder)} className="text-primary hover:underline font-mono">
                          {po.workOrder.documentNo ?? `WO #${po.workOrder.id}`}
                        </Link>
                      ) : "-"
                    }
                  />
                  <DetailField label="Dibuat" value={formatDate(po.createdAt, { includeTime: true })} />
                </DetailCard>

                {/* Ringkasan Finansial PO */}
                <DetailCard title="Ringkasan Finansial">
                  <DetailField label="Subtotal" value={formatCurrencyExact(Number(po.subtotal))} />
                  <DetailField label="Diskon" value={formatCurrencyExact(Number(po.discount))} />
                  <DetailField label="PPN / Pajak" value={formatCurrencyExact(Number(po.tax))} />
                  {Number(po.shippingCost) > 0 && (
                    <DetailField label="Ongkos Kirim" value={formatCurrencyExact(Number(po.shippingCost))} />
                  )}
                  {Number(po.serviceFee) > 0 && (
                    <DetailField label="Biaya Layanan" value={formatCurrencyExact(Number(po.serviceFee))} />
                  )}
                  <DetailField
                    label="Total Keseluruhan"
                    value={<span className="text-lg font-bold text-foreground">{formatCurrencyExact(Number(po.grandTotal))}</span>}
                  />
                </DetailCard>

                {/* Notes */}
                {po.notes && (
                  <DetailCard>
                    <DetailField label="Catatan" value={po.notes} colSpan="full" />
                  </DetailCard>
                )}
              </>
            ),
          },
          {
            id: "items",
            label: "Item",
            content: (
              <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-4 p-4 px-5 border-b border-default">
                  <h2 className="text-[0.9375rem] font-semibold text-foreground">Barang</h2>
                </div>
                <div className="p-4 px-5">
                  <PurchaseOrderItemsTable
                    data={po.items.map((item) => ({
                      id: item.id,
                      itemName: itemNameMap.get(item.itemId) || `Item #${item.itemId}`,
                      qty: Number(item.qty),
                      receivedQty: Number(item.receivedQty),
                      unitPrice: Number(item.unitPrice),
                      total: Number(item.total),
                    }))}
                    grandTotal={Number(po.grandTotal)}
                  />
                </div>
              </div>
            ),
          },
          {
            id: "penerimaan",
            label: "Penerimaan",
            content: (
              <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-4 p-4 px-5 border-b border-default">
                  <h2 className="text-[0.9375rem] font-semibold text-foreground">Penerimaan Barang</h2>
                  {["approved", "ordered", "partial_received"].includes(po.status) && (
                    <CanCreate permission="create_goods_receipts">
                      <Link href={`/pembelian/penerimaan/tambah/po/${po.slug ?? po.id}`} className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border border-default transition-all hover:bg-surface-secondary">
                        <Plus className="size-3.5" aria-hidden="true" />
                        <span>Buat Penerimaan</span>
                      </Link>
                    </CanCreate>
                  )}
                </div>
                <div className="p-4 px-5">
                  {po.goodsReceipts.length === 0 ? (
                    <EmptyState title="Belum ada penerimaan barang" />
                  ) : (
                    <PurchaseOrderReceiptsTable
                      data={po.goodsReceipts.map((gr) => ({
                        id: gr.id,
                        slug: gr.slug,
                        documentNo: gr.documentNo,
                        date: gr.date.toISOString(),
                        itemCount: gr.items.length,
                        status: gr.status,
                      }))}
                    />
                  )}
                </div>
              </div>
            ),
          },
          {
            id: "retur",
            label: "Retur",
            content: (
              <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-4 p-4 px-5 border-b border-default">
                  <h2 className="text-[0.9375rem] font-semibold text-foreground">Retur Pembelian</h2>
                  {/* "Buat Retur dari PO" — PO-nya ikut ter-prefill (dan barisnya
                      dari qty yang sudah diterima) lewat segmen `po/<slug>` di halaman retur.
                      Hanya ditawarkan bila memang sudah ada barang diterima
                      (GR terverifikasi/selesai); PO rejected/draft/belum
                      terima tidak punya apa pun untuk diretur. */}
                  {po.goodsReceipts.some((gr) => ["verified", "completed"].includes(gr.status)) && (
                    <CanCreate permission="create_purchase_returns">
                      <Link href={`/pembelian/retur/tambah/po/${po.slug ?? po.id}`} className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border border-default transition-all hover:bg-surface-secondary">
                        <Plus className="size-3.5" aria-hidden="true" />
                        <span>Buat Retur</span>
                      </Link>
                    </CanCreate>
                  )}
                </div>
                <div className="p-4 px-5">
                  {po.purchaseReturns.length === 0 ? (
                    <EmptyState title="Belum ada retur" />
                  ) : (
                    <PurchaseOrderReturnsTable
                      data={po.purchaseReturns.map((retur) => ({
                        id: retur.id,
                        slug: retur.slug,
                        documentNo: retur.documentNo,
                        date: retur.date.toISOString(),
                        itemCount: retur.items.length,
                        status: retur.status,
                      }))}
                    />
                  )}
                </div>
              </div>
            ),
          },
          {
            id: "bills",
            label: "Tagihan",
            content: (
              <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-4 p-4 px-5 border-b border-default">
                  <h2 className="text-[0.9375rem] font-semibold text-foreground">Tagihan Pemasok</h2>
                </div>
                <div className="p-4 px-5">
                  {po.vendorBills.length === 0 ? (
                    <EmptyState title="Belum ada tagihan" />
                  ) : (
                    <PurchaseOrderBillsTable
                      data={po.vendorBills.map((b) => ({
                        id: b.id,
                        slug: b.slug,
                        documentNo: b.documentNo,
                        grandTotal: Number(b.grandTotal),
                      }))}
                    />
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
