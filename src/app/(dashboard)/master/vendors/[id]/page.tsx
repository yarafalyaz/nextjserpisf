export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { formatCurrency, formatDate, getInitials } from "@/lib/utils/format"
import Link from "next/link"
import { notFound } from "next/navigation"
import { Pencil } from "lucide-react"
import { DetailTabs } from "@/components/ui/detail-tabs"
import { StatusChip } from "@/components/ui/status-chip"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { Avatar } from "@heroui/react"

export default async function VendorDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const vendor = await prisma.vendor.findUnique({
    where: { id: Number(id), deletedAt: null },
    include: {
      purchaseOrders: { take: 10, orderBy: { createdAt: "desc" } },
      vendorBills: { take: 10, orderBy: { createdAt: "desc" } },
    },
  })

  if (!vendor) notFound()

  const [goodsReceipts, purchaseReturns] = await Promise.all([
    prisma.goodsReceipt.findMany({
      where: { purchaseOrder: { vendorId: Number(id) } },
      include: { purchaseOrder: true, warehouse: true },
      take: 10,
      orderBy: { createdAt: "desc" },
    }),
    prisma.purchaseReturn.findMany({
      where: { purchaseOrder: { vendorId: Number(id) } },
      include: { purchaseOrder: true },
      take: 10,
      orderBy: { createdAt: "desc" },
    }),
  ])

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dashboard", href: "/" },
  { label: "Master Data", href: "/master" },
  { label: "Vendors", href: "/master/vendors" },
  { label: "Detail" },
]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <Avatar size="lg" color="accent">
            <Avatar.Fallback>{getInitials(vendor.name)}</Avatar.Fallback>
          </Avatar>
          <h1 className="text-2xl font-bold text-foreground">{vendor.name}</h1>
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          <Link href={`/master/vendors/${id}/edit`} className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-surface-secondary text-foreground border border-default hover:bg-surface-tertiary transition-all"><Pencil size={14} className="inline" /> Edit</Link>
          <Link href="/master/vendors" className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:bg-surface-secondary hover:text-foreground transition-all">← Kembali</Link>
        </div>
      </div>

      <DetailTabs
        ariaLabel="Vendor detail tabs"
        tabs={[
          {
            id: "info",
            label: "Info",
            content: (
              <div className="bg-surface rounded-xl border border-default shadow-sm p-6">
                <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
                  <div className="flex flex-col gap-1">
                    <span className="text-xs font-medium text-muted uppercase tracking-wide">Email</span>
                    <span className="text-[0.9375rem] text-foreground font-medium">{vendor.email || "-"}</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-xs font-medium text-muted uppercase tracking-wide">Telepon</span>
                    <span className="text-[0.9375rem] text-foreground font-medium">{vendor.phone || "-"}</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-xs font-medium text-muted uppercase tracking-wide">Kota</span>
                    <span className="text-[0.9375rem] text-foreground font-medium">{vendor.city || "-"}</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-xs font-medium text-muted uppercase tracking-wide">NPWP</span>
                    <span className="text-[0.9375rem] text-foreground font-medium font-mono">{vendor.npwp || "-"}</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-xs font-medium text-muted uppercase tracking-wide">Terdaftar</span>
                    <span className="text-[0.9375rem] text-foreground font-medium">{formatDate(vendor.createdAt)}</span>
                  </div>
                  <div className="flex flex-col gap-1" style={{ gridColumn: "1 / -1" }}>
                    <span className="text-xs font-medium text-muted uppercase tracking-wide">Alamat</span>
                    <span className="text-[0.9375rem] text-foreground font-medium">{vendor.address || "-"}</span>
                  </div>
                </div>
              </div>
            ),
          },
          {
            id: "po",
            label: `Purchase Orders (${vendor.purchaseOrders.length})`,
            content: (
              <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
                <div className="flex items-center justify-between p-4 px-5 border-b border-default">
                  <h2 className="text-[0.9375rem] font-semibold text-foreground">Purchase Order Terbaru</h2>
                  <Link href={`/purchase/orders?search=${vendor.name}`} className="text-[0.8125rem] text-primary font-medium hover:underline">Lihat Semua →</Link>
                </div>
                <div className="p-4 px-5">
                  {vendor.purchaseOrders.length === 0 ? (
                    <p className="flex flex-col items-center justify-center py-16 text-center text-muted">Belum ada purchase order</p>
                  ) : (
                    <table className="w-full border-collapse">
                      <thead>
                        <tr><th>No. Dokumen</th><th>Tanggal</th><th>Total</th><th>Status</th></tr>
                      </thead>
                      <tbody>
                        {vendor.purchaseOrders.map((po) => (
                          <tr key={po.id}>
                            <td className="font-mono"><Link href={`/purchase/orders/${po.id}`}>{po.documentNo}</Link></td>
                            <td>{formatDate(po.date)}</td>
                            <td className="text-right">{formatCurrency(Number(po.grandTotal))}</td>
                            <td><StatusChip status={po.status} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            ),
          },
          {
            id: "goods-receipts",
            label: `Goods Receipts (${goodsReceipts.length})`,
            content: (
              <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
                <div className="flex items-center justify-between p-4 px-5 border-b border-default">
                  <h2 className="text-[0.9375rem] font-semibold text-foreground">Penerimaan Barang</h2>
                  <Link href={`/purchase/goods-receipts?search=${vendor.name}`} className="text-[0.8125rem] text-primary font-medium hover:underline">Lihat Semua →</Link>
                </div>
                <div className="p-4 px-5">
                  {goodsReceipts.length === 0 ? (
                    <p className="flex flex-col items-center justify-center py-16 text-center text-muted">Belum ada penerimaan barang</p>
                  ) : (
                    <table className="w-full border-collapse">
                      <thead>
                        <tr><th>No. Dokumen</th><th>Tanggal</th><th>No. PO</th><th>Gudang</th><th>Status</th></tr>
                      </thead>
                      <tbody>
                        {goodsReceipts.map((gr) => (
                          <tr key={gr.id}>
                            <td className="font-mono">{gr.documentNo}</td>
                            <td>{formatDate(gr.date)}</td>
                            <td className="font-mono"><Link href={`/purchase/orders/${gr.purchaseOrder.id}`}>{gr.purchaseOrder.documentNo}</Link></td>
                            <td>{gr.warehouse?.name || "-"}</td>
                            <td><StatusChip status={gr.status} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            ),
          },
          {
            id: "returns",
            label: `Returns (${purchaseReturns.length})`,
            content: (
              <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
                <div className="flex items-center justify-between p-4 px-5 border-b border-default">
                  <h2 className="text-[0.9375rem] font-semibold text-foreground">Retur Pembelian</h2>
                  <Link href={`/purchase/returns?search=${vendor.name}`} className="text-[0.8125rem] text-primary font-medium hover:underline">Lihat Semua →</Link>
                </div>
                <div className="p-4 px-5">
                  {purchaseReturns.length === 0 ? (
                    <p className="flex flex-col items-center justify-center py-16 text-center text-muted">Belum ada retur</p>
                  ) : (
                    <table className="w-full border-collapse">
                      <thead>
                        <tr><th>No. Dokumen</th><th>Tanggal</th><th>No. PO</th><th>Status</th></tr>
                      </thead>
                      <tbody>
                        {purchaseReturns.map((pr) => (
                          <tr key={pr.id}>
                            <td className="font-mono">{pr.documentNo}</td>
                            <td>{formatDate(pr.date)}</td>
                            <td className="font-mono"><Link href={`/purchase/orders/${pr.purchaseOrder.id}`}>{pr.purchaseOrder.documentNo}</Link></td>
                            <td><StatusChip status={pr.status} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            ),
          },
          {
            id: "bills",
            label: `Bills (${vendor.vendorBills.length})`,
            content: (
              <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
                <div className="flex items-center justify-between p-4 px-5 border-b border-default">
                  <h2 className="text-[0.9375rem] font-semibold text-foreground">Tagihan Terbaru</h2>
                  <Link href={`/purchase/bills?search=${vendor.name}`} className="text-[0.8125rem] text-primary font-medium hover:underline">Lihat Semua →</Link>
                </div>
                <div className="p-4 px-5">
                  {vendor.vendorBills.length === 0 ? (
                    <p className="flex flex-col items-center justify-center py-16 text-center text-muted">Belum ada tagihan</p>
                  ) : (
                    <table className="w-full border-collapse">
                      <thead>
                        <tr><th>No. Dokumen</th><th>Tanggal</th><th>Total</th><th>Terbayar</th><th>Status</th></tr>
                      </thead>
                      <tbody>
                        {vendor.vendorBills.map((bill) => (
                          <tr key={bill.id}>
                            <td className="font-mono"><Link href={`/purchase/bills/${bill.id}`}>{bill.documentNo}</Link></td>
                            <td>{formatDate(bill.date)}</td>
                            <td className="text-right">{formatCurrency(Number(bill.grandTotal))}</td>
                            <td className="text-right">{formatCurrency(Number(bill.paidAmount))}</td>
                            <td><StatusChip status={bill.status} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
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
