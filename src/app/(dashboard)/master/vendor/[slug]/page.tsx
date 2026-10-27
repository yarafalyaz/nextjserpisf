export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { formatCurrency, formatDate } from "@/lib/utils/format"
import Link from "next/link"
import { notFound } from "next/navigation"
import { Pencil } from "lucide-react"
import { EmptyState } from "@/components/ui/empty-state"
import { DetailTabs } from "@/components/ui/detail-tabs"
import { StatusChip } from "@/components/ui/status-chip"
import { PageHeader, BackButton } from "@/components/ui/page-header"
import { Button } from "@/components/ui/button"
import { DetailCard, DetailField } from "@/components/ui/detail-card"
import { DetailTable, DetailTableHead, DetailTableTh, DetailTableBody, DetailTableRow, DetailTableTd } from "@/components/ui/detail-table"

import type { Metadata } from "next"

import { requirePermission } from "@/lib/auth/permissions"
import { CanCreate } from "@/components/auth/can-create"
import { resolveEntity } from "@/lib/utils/resolve-entity"
import { entityHref, entityEditHref } from "@/lib/utils/entity-url"
export const metadata: Metadata = { title: "Pemasok" }

export default async function VendorDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  await requirePermission("view_vendors")

  const { slug } = await params

  const vendor = await resolveEntity(
    { segment: slug, fallbackWhere: { deletedAt: null } },
    {
      bySlug: (s, where) =>
        prisma.vendor.findFirst({
          where: { slug: s, ...where },
          include: {
            purchaseOrders: { take: 10, orderBy: { createdAt: "desc" } },
            vendorBills: { take: 10, orderBy: { createdAt: "desc" } },
            items: { take: 20, orderBy: { name: "asc" } },
          },
        }),
      byId: (id, where) =>
        prisma.vendor.findUnique({
          where: { id, ...where },
          include: {
            purchaseOrders: { take: 10, orderBy: { createdAt: "desc" } },
            vendorBills: { take: 10, orderBy: { createdAt: "desc" } },
            items: { take: 20, orderBy: { name: "asc" } },
          },
        }),
    },
  )

  if (!vendor) notFound()

  const [goodsReceipts, purchaseReturns] = await Promise.all([
    prisma.goodsReceipt.findMany({
      where: { purchaseOrder: { vendorId: vendor.id } },
      include: { purchaseOrder: true, warehouse: true },
      take: 10,
      orderBy: { createdAt: "desc" },
    }),
    prisma.purchaseReturn.findMany({
      where: { purchaseOrder: { vendorId: vendor.id } },
      include: { purchaseOrder: true },
      take: 10,
      orderBy: { createdAt: "desc" },
    }),
  ])

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={vendor.name}
        breadcrumbs={[
          { label: "Dasbor", href: "/" },
          { label: "Data Master", href: "/master" },
          { label: "Pemasok", href: "/master/vendor" },
          { label: "Detail" },
        ]}
        actions={
          <>
            <CanCreate permission="edit_vendors">
              <Button href={entityEditHref("/master/vendor", vendor)} variant="secondary"><Pencil size={14} /> Ubah</Button>
            </CanCreate>
            <BackButton href="/master/vendor" />
          </>
        }
      />

      <DetailTabs
        ariaLabel="Tab detail pemasok"
        tabs={[
          {
            id: "info",
            label: "Info",
            content: (
              <DetailCard>
                <DetailField label="Email" value={vendor.email || "-"} />
                <DetailField label="Telepon" value={vendor.phone || "-"} />
                <DetailField label="Kota" value={vendor.city || "-"} />
                <DetailField label="NPWP" value={vendor.npwp || "-"} mono />
                <DetailField label="Terdaftar" value={formatDate(vendor.createdAt)} />
                <DetailField label="Alamat" value={vendor.address || "-"} colSpan="full" />
              </DetailCard>
            ),
          },
          {
            id: "po",
            label: `Pesanan Pembelian (${vendor.purchaseOrders.length})`,
            content: (
              <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-4 p-4 px-5 border-b border-default">
                  <h2 className="text-[0.9375rem] font-semibold text-foreground">Pesanan Pembelian Terbaru</h2>
                  <Link href={`/pembelian/pesanan?cari=${vendor.name}`} className="text-[0.8125rem] text-primary font-medium hover:underline">Lihat Semua →</Link>
                </div>
                <div className="p-4 px-5">
                  {vendor.purchaseOrders.length === 0 ? (
                    <EmptyState title="Belum ada pesanan pembelian" />
                  ) : (
                    <DetailTable>
                      <DetailTableHead>
                        <DetailTableTh>No. Dokumen</DetailTableTh>
                        <DetailTableTh>Tanggal</DetailTableTh>
                        <DetailTableTh align="right">Total</DetailTableTh>
                        <DetailTableTh>Status</DetailTableTh>
                      </DetailTableHead>
                      <DetailTableBody>
                        {vendor.purchaseOrders.map((po) => (
                          <DetailTableRow key={po.id}>
                            <DetailTableTd className="font-mono"><Link href={entityHref("/pembelian/pesanan", po)}>{po.documentNo}</Link></DetailTableTd>
                            <DetailTableTd>{formatDate(po.date)}</DetailTableTd>
                            <DetailTableTd align="right">{formatCurrency(Number(po.grandTotal))}</DetailTableTd>
                            <DetailTableTd><StatusChip status={po.status} /></DetailTableTd>
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
            id: "goods-receipts",
            label: `Penerimaan Barang (${goodsReceipts.length})`,
            content: (
              <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-4 p-4 px-5 border-b border-default">
                  <h2 className="text-[0.9375rem] font-semibold text-foreground">Penerimaan Barang</h2>
                  <Link href={`/pembelian/penerimaan?cari=${vendor.name}`} className="text-[0.8125rem] text-primary font-medium hover:underline">Lihat Semua →</Link>
                </div>
                <div className="p-4 px-5">
                  {goodsReceipts.length === 0 ? (
                    <EmptyState title="Belum ada penerimaan barang" />
                  ) : (
                    <DetailTable>
                      <DetailTableHead>
                        <DetailTableTh>No. Dokumen</DetailTableTh>
                        <DetailTableTh>Tanggal</DetailTableTh>
                        <DetailTableTh>No. Pesanan</DetailTableTh>
                        <DetailTableTh>Gudang</DetailTableTh>
                        <DetailTableTh>Status</DetailTableTh>
                      </DetailTableHead>
                      <DetailTableBody>
                        {goodsReceipts.map((gr) => (
                          <DetailTableRow key={gr.id}>
                            <DetailTableTd className="font-mono">{gr.documentNo}</DetailTableTd>
                            <DetailTableTd>{formatDate(gr.date)}</DetailTableTd>
                            <DetailTableTd className="font-mono"><Link href={entityHref("/pembelian/pesanan", gr.purchaseOrder)}>{gr.purchaseOrder.documentNo}</Link></DetailTableTd>
                            <DetailTableTd>{gr.warehouse?.name || "-"}</DetailTableTd>
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
            id: "returns",
            label: `Retur (${purchaseReturns.length})`,
            content: (
              <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-4 p-4 px-5 border-b border-default">
                  <h2 className="text-[0.9375rem] font-semibold text-foreground">Retur Pembelian</h2>
                  <Link href={`/pembelian/retur?cari=${vendor.name}`} className="text-[0.8125rem] text-primary font-medium hover:underline">Lihat Semua →</Link>
                </div>
                <div className="p-4 px-5">
                  {purchaseReturns.length === 0 ? (
                    <EmptyState title="Belum ada retur" />
                  ) : (
                    <DetailTable>
                      <DetailTableHead>
                        <DetailTableTh>No. Dokumen</DetailTableTh>
                        <DetailTableTh>Tanggal</DetailTableTh>
                        <DetailTableTh>No. Pesanan</DetailTableTh>
                        <DetailTableTh>Status</DetailTableTh>
                      </DetailTableHead>
                      <DetailTableBody>
                        {purchaseReturns.map((pr) => (
                          <DetailTableRow key={pr.id}>
                            <DetailTableTd className="font-mono">{pr.documentNo}</DetailTableTd>
                            <DetailTableTd>{formatDate(pr.date)}</DetailTableTd>
                            <DetailTableTd className="font-mono"><Link href={entityHref("/pembelian/pesanan", pr.purchaseOrder)}>{pr.purchaseOrder.documentNo}</Link></DetailTableTd>
                            <DetailTableTd><StatusChip status={pr.status} /></DetailTableTd>
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
            label: `Tagihan (${vendor.vendorBills.length})`,
            content: (
              <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-4 p-4 px-5 border-b border-default">
                  <h2 className="text-[0.9375rem] font-semibold text-foreground">Tagihan Terbaru</h2>
                  <Link href={`/pembelian/tagihan?cari=${vendor.name}`} className="text-[0.8125rem] text-primary font-medium hover:underline">Lihat Semua →</Link>
                </div>
                <div className="p-4 px-5">
                  {vendor.vendorBills.length === 0 ? (
                    <EmptyState title="Belum ada tagihan" />
                  ) : (
                    <DetailTable>
                      <DetailTableHead>
                        <DetailTableTh>No. Dokumen</DetailTableTh>
                        <DetailTableTh>Tanggal</DetailTableTh>
                        <DetailTableTh align="right">Total</DetailTableTh>
                        <DetailTableTh align="right">Terbayar</DetailTableTh>
                        <DetailTableTh>Status</DetailTableTh>
                      </DetailTableHead>
                      <DetailTableBody>
                        {vendor.vendorBills.map((bill) => (
                          <DetailTableRow key={bill.id}>
                            <DetailTableTd className="font-mono"><Link href={entityHref("/pembelian/tagihan", bill)}>{bill.documentNo}</Link></DetailTableTd>
                            <DetailTableTd>{formatDate(bill.date)}</DetailTableTd>
                            <DetailTableTd align="right">{formatCurrency(Number(bill.grandTotal))}</DetailTableTd>
                            <DetailTableTd align="right">{formatCurrency(Number(bill.paidAmount))}</DetailTableTd>
                            <DetailTableTd><StatusChip status={bill.status} /></DetailTableTd>
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
            id: "items",
            label: `Barang (${vendor.items.length})`,
            content: (
              <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-4 p-4 px-5 border-b border-default">
                  <h2 className="text-[0.9375rem] font-semibold text-foreground">Barang yang Dipasok</h2>
                  <Link href={`/master/barang?cari=${vendor.name}`} className="text-[0.8125rem] text-primary font-medium hover:underline">Lihat Semua →</Link>
                </div>
                <div className="p-4 px-5">
                  {vendor.items.length === 0 ? (
                    <EmptyState title="Belum ada barang dari pemasok ini" />
                  ) : (
                    <DetailTable>
                      <DetailTableHead>
                        <DetailTableTh>SKU</DetailTableTh>
                        <DetailTableTh>Nama</DetailTableTh>
                        <DetailTableTh align="right">Harga Beli</DetailTableTh>
                        <DetailTableTh align="right">Stok</DetailTableTh>
                      </DetailTableHead>
                      <DetailTableBody>
                        {vendor.items.map((item) => (
                          <DetailTableRow key={item.id}>
                            <DetailTableTd className="font-mono"><Link href={entityHref("/master/barang", item)}>{item.sku}</Link></DetailTableTd>
                            <DetailTableTd>{item.name}</DetailTableTd>
                            <DetailTableTd align="right">{formatCurrency(Number(item.cost))}</DetailTableTd>
                            <DetailTableTd align="right">{Number(item.qtyOnHand)}</DetailTableTd>
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
