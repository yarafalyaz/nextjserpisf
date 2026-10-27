export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { hasPermission, requirePermission } from "@/lib/auth/permissions"
import { resolveEntity } from "@/lib/utils/resolve-entity"
import { entityHref, entityEditHref } from "@/lib/utils/entity-url"
import { formatCurrency, formatDate } from "@/lib/utils/format"
import Link from "next/link"
import { notFound } from "next/navigation"
import { StatusChip } from "@/components/ui/status-chip"
import { DetailTabs } from "@/components/ui/detail-tabs"
import { DeleteButton } from "@/components/ui/delete-button"
import { VoidButton } from "@/components/ui/void-button"
import { cancelPurchaseOrder, deletePurchaseOrder } from "@/actions/purchase.actions"
import { StatusActions } from "@/components/ui/status-actions"
import { PrintButton } from "@/components/ui/print-button"
import { PageHeader, BackButton } from "@/components/ui/page-header"
import { Button } from "@/components/ui/button"
import { DetailCard, DetailField } from "@/components/ui/detail-card"
import { DetailTable, DetailTableHead, DetailTableTh, DetailTableBody, DetailTableRow, DetailTableTd, DetailTableFoot, DetailTableFootRow } from "@/components/ui/detail-table"
import { EmptyState } from "@/components/ui/empty-state"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Pesanan" }

export default async function PurchaseOrderDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  await requirePermission("view_purchase_orders")
  const canApprove = await hasPermission("approve_purchase_orders")
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
            <Button href={entityEditHref("/pembelian/pesanan", po)} variant="primary">Ubah</Button>
            {po.vendorBills.length === 0 &&
              (po.isService
                ? !["draft", "cancelled", "rejected"].includes(po.status)
                : po.goodsReceipts.some((gr) => ["verified", "completed"].includes(gr.status))) && (
              <Button href={`/pembelian/tagihan/tambah/po/${po.slug ?? po.id}`}>
                {po.isService ? "Buat Tagihan Jasa" : "Buat Tagihan"}
              </Button>
            )}
            <PrintButton documentType="purchase-order" documentId={po.id} />
            {/* Status yang sama dengan penjagaan di cancelPurchaseOrder: tombol tak
                muncul di tempat yang aksinya pasti menolak. */}
            {!["received", "cancelled", "partial_received"].includes(po.status) && (
              <VoidButton id={po.id} action={cancelPurchaseOrder} />
            )}
            <DeleteButton id={po.id} action={deletePurchaseOrder} />
            <BackButton href="/pembelian/pesanan" />
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
                  <DetailField label="Tanggal" value={formatDate(po.date)} />
                  <DetailField label="Tanggal Diharapkan" value={formatDate(po.expectedDate)} />
                  <DetailField label="No. PR" value={po.purchaseRequest?.documentNo || "-"} mono />
                  <DetailField
                    label={po.isService ? "Perintah Kerja (Jasa)" : "Perintah Kerja"}
                    value={
                      po.workOrder ? (
                        <Link href={entityHref("/produksi/perintah-kerja", po.workOrder)} className="hover:underline">
                          {po.workOrder.documentNo ?? `WO #${po.workOrder.id}`}
                        </Link>
                      ) : "-"
                    }
                  />
                  <DetailField label="Total Keseluruhan" value={formatCurrency(Number(po.grandTotal))} />
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
                  <DetailTable>
                    <DetailTableHead>
                      <DetailTableTh>Nama Barang</DetailTableTh>
                      <DetailTableTh align="right">Jml</DetailTableTh>
                      <DetailTableTh align="right">Diterima</DetailTableTh>
                      <DetailTableTh align="right">Harga</DetailTableTh>
                      <DetailTableTh align="right">Total</DetailTableTh>
                    </DetailTableHead>
                    <DetailTableBody>
                      {po.items.map((item) => (
                        <DetailTableRow key={item.id}>
                          <DetailTableTd>{itemNameMap.get(item.itemId) || `Item #${item.itemId}`}</DetailTableTd>
                          <DetailTableTd align="right">{Number(item.qty)}</DetailTableTd>
                          <DetailTableTd align="right">{Number(item.receivedQty)}</DetailTableTd>
                          <DetailTableTd align="right">{formatCurrency(Number(item.unitPrice))}</DetailTableTd>
                          <DetailTableTd align="right">{formatCurrency(Number(item.total))}</DetailTableTd>
                        </DetailTableRow>
                      ))}
                    </DetailTableBody>
                    <DetailTableFoot>
                      <DetailTableFootRow>
                        <DetailTableTd colSpan={4} align="right"><strong>Total Keseluruhan</strong></DetailTableTd>
                        <DetailTableTd align="right"><strong>{formatCurrency(Number(po.grandTotal))}</strong></DetailTableTd>
                      </DetailTableFootRow>
                    </DetailTableFoot>
                  </DetailTable>
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
                    <Link href={`/pembelian/penerimaan/tambah/po/${po.slug ?? po.id}`} className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border border-default transition-all hover:bg-surface-secondary">+ Buat Penerimaan</Link>
                  )}
                </div>
                <div className="p-4 px-5">
                  {po.goodsReceipts.length === 0 ? (
                    <EmptyState title="Belum ada penerimaan barang" />
                  ) : (
                    <DetailTable>
                      <DetailTableHead>
                        <DetailTableTh>No. Dokumen</DetailTableTh>
                        <DetailTableTh>Tanggal</DetailTableTh>
                        <DetailTableTh>Barang</DetailTableTh>
                        <DetailTableTh>Status</DetailTableTh>
                      </DetailTableHead>
                      <DetailTableBody>
                        {po.goodsReceipts.map((gr) => (
                          <DetailTableRow key={gr.id}>
                            <DetailTableTd className="font-mono"><Link href={entityHref("/pembelian/penerimaan", gr)}>{gr.documentNo}</Link></DetailTableTd>
                            <DetailTableTd>{formatDate(gr.date)}</DetailTableTd>
                            <DetailTableTd>{gr.items.length} item</DetailTableTd>
                            <DetailTableTd><StatusChip status={gr.status} /></DetailTableTd>
                          </DetailTableRow>
                        ))}
                      </DetailTableBody>
                    </DetailTable>
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
                    <Link href={`/pembelian/retur/tambah/po/${po.slug ?? po.id}`} className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border border-default transition-all hover:bg-surface-secondary">+ Buat Retur</Link>
                  )}
                </div>
                <div className="p-4 px-5">
                  {po.purchaseReturns.length === 0 ? (
                    <EmptyState title="Belum ada retur" />
                  ) : (
                    <DetailTable>
                      <DetailTableHead>
                        <DetailTableTh>No. Dokumen</DetailTableTh>
                        <DetailTableTh>Tanggal</DetailTableTh>
                        <DetailTableTh>Barang</DetailTableTh>
                        <DetailTableTh>Status</DetailTableTh>
                      </DetailTableHead>
                      <DetailTableBody>
                        {po.purchaseReturns.map((retur) => (
                          <DetailTableRow key={retur.id}>
                            <DetailTableTd className="font-mono"><Link href={entityHref("/pembelian/retur", retur)}>{retur.documentNo}</Link></DetailTableTd>
                            <DetailTableTd>{formatDate(retur.date)}</DetailTableTd>
                            <DetailTableTd>{retur.items.length} item</DetailTableTd>
                            <DetailTableTd><StatusChip status={retur.status} /></DetailTableTd>
                          </DetailTableRow>
                        ))}
                      </DetailTableBody>
                    </DetailTable>
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
                    <DetailTable>
                      <DetailTableHead>
                        <DetailTableTh>No. Dokumen</DetailTableTh>
                        <DetailTableTh align="right">Total</DetailTableTh>
                      </DetailTableHead>
                      <DetailTableBody>
                        {po.vendorBills.map((b) => (
                          <DetailTableRow key={b.id}>
                            <DetailTableTd className="font-mono"><Link href={entityHref("/pembelian/tagihan", b)}>{b.documentNo}</Link></DetailTableTd>
                            <DetailTableTd align="right">{formatCurrency(Number(b.grandTotal))}</DetailTableTd>
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
