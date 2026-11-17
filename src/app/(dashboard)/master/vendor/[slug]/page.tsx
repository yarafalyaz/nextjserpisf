export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { formatCurrencyExact, formatDate } from "@/lib/utils/format"
import Link from "next/link"
import { notFound } from "next/navigation"
import { Pencil } from "@/components/ui/fontawesome-icons"
import { EmptyState } from "@/components/ui/empty-state"
import { DetailTabs } from "@/components/ui/detail-tabs"
import { PageHeader } from "@/components/ui/page-header"
import { Button } from "@/components/ui/button"
import { DetailCard, DetailField } from "@/components/ui/detail-card"
import {
  VendorBillsTable,
  VendorGoodsReceiptsTable,
  VendorItemsTable,
  VendorPurchaseOrdersTable,
  VendorPurchaseReturnsTable,
} from "./_components/vendor-detail-tables"

import type { Metadata } from "next"

import { requirePermission } from "@/lib/auth/permissions"
import { canViewCostAmounts } from "@/lib/auth/field-visibility"
import { CanCreate } from "@/components/auth/can-create"
import { resolveEntity } from "@/lib/utils/resolve-entity"
import { entityEditHref } from "@/lib/utils/entity-url"
export const metadata: Metadata = { title: "Pemasok" }

export default async function VendorDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  await requirePermission("view_vendors")
  const canViewCosts = await canViewCostAmounts()

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
              <Button href={entityEditHref("/master/vendor", vendor)} variant="secondary"><Pencil aria-hidden="true" size={14} /> Ubah</Button>
            </CanCreate>
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
                    <VendorPurchaseOrdersTable
                      data={vendor.purchaseOrders.map((po) => ({
                        id: po.id,
                        slug: po.slug,
                        documentNo: po.documentNo,
                        date: po.date.toISOString(),
                        grandTotal: Number(po.grandTotal),
                        grandTotalFormatted: formatCurrencyExact(Number(po.grandTotal)),
                        status: po.status,
                      }))}
                    />
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
                    <VendorGoodsReceiptsTable
                      data={goodsReceipts.map((gr) => ({
                        id: gr.id,
                        documentNo: gr.documentNo,
                        date: gr.date.toISOString(),
                        purchaseOrder: {
                          id: gr.purchaseOrder.id,
                          slug: gr.purchaseOrder.slug,
                          documentNo: gr.purchaseOrder.documentNo,
                        },
                        warehouseName: gr.warehouse?.name ?? null,
                        status: gr.status,
                      }))}
                    />
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
                    <VendorPurchaseReturnsTable
                      data={purchaseReturns.map((pr) => ({
                        id: pr.id,
                        documentNo: pr.documentNo,
                        date: pr.date.toISOString(),
                        purchaseOrder: {
                          id: pr.purchaseOrder.id,
                          slug: pr.purchaseOrder.slug,
                          documentNo: pr.purchaseOrder.documentNo,
                        },
                        status: pr.status,
                      }))}
                    />
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
                    <VendorBillsTable
                      data={vendor.vendorBills.map((bill) => ({
                        id: bill.id,
                        slug: bill.slug,
                        documentNo: bill.documentNo,
                        date: bill.date.toISOString(),
                        grandTotal: Number(bill.grandTotal),
                        paidAmount: Number(bill.paidAmount),
                        status: bill.status,
                      }))}
                    />
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
                    <VendorItemsTable
                      canViewCosts={canViewCosts}
                      data={vendor.items.map((item) => ({
                        id: item.id,
                        slug: item.slug,
                        sku: item.sku,
                        name: item.name,
                        cost: Number(item.cost),
                        qtyOnHand: Number(item.qtyOnHand),
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
