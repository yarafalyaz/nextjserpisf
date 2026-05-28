export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { formatCurrency, formatDate, getInitials } from "@/lib/utils/format"
import Link from "next/link"
import { notFound } from "next/navigation"
import { Pencil } from "lucide-react"
import { DetailTabs } from "@/components/ui/detail-tabs"
import { StatusChip } from "@/components/ui/status-chip"
import { PageHeader, Button, BackButton } from "@/components/ui/page-header"
import { DetailCard, DetailField } from "@/components/ui/detail-card"
import { DetailTable, DetailTableHead, DetailTableTh, DetailTableBody, DetailTableRow, DetailTableTd } from "@/components/ui/detail-table"

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
      <PageHeader
        title={vendor.name}
        breadcrumbs={[
          { label: "Dashboard", href: "/" },
          { label: "Master Data", href: "/master" },
          { label: "Vendors", href: "/master/pemasok" },
          { label: "Detail" },
        ]}
        actions={
          <>
            <Button href={`/master/pemasok/${id}/edit`} variant="secondary"><Pencil size={14} /> Edit</Button>
            <BackButton href="/master/pemasok" />
          </>
        }
      />

      <DetailTabs
        ariaLabel="Vendor detail tabs"
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
            label: `Purchase Orders (${vendor.purchaseOrders.length})`,
            content: (
              <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
                <div className="flex items-center justify-between p-4 px-5 border-b border-default">
                  <h2 className="text-[0.9375rem] font-semibold text-foreground">Purchase Order Terbaru</h2>
                  <Link href={`/pembelian/pesanan?cari=${vendor.name}`} className="text-[0.8125rem] text-primary font-medium hover:underline">Lihat Semua →</Link>
                </div>
                <div className="p-4 px-5">
                  {vendor.purchaseOrders.length === 0 ? (
                    <p className="flex flex-col items-center justify-center py-16 text-center text-muted">Belum ada purchase order</p>
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
                            <DetailTableTd className="font-mono"><Link href={`/pembelian/pesanan/${po.id}`}>{po.documentNo}</Link></DetailTableTd>
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
            label: `Goods Receipts (${goodsReceipts.length})`,
            content: (
              <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
                <div className="flex items-center justify-between p-4 px-5 border-b border-default">
                  <h2 className="text-[0.9375rem] font-semibold text-foreground">Penerimaan Barang</h2>
                  <Link href={`/pembelian/penerimaan?cari=${vendor.name}`} className="text-[0.8125rem] text-primary font-medium hover:underline">Lihat Semua →</Link>
                </div>
                <div className="p-4 px-5">
                  {goodsReceipts.length === 0 ? (
                    <p className="flex flex-col items-center justify-center py-16 text-center text-muted">Belum ada penerimaan barang</p>
                  ) : (
                    <DetailTable>
                      <DetailTableHead>
                        <DetailTableTh>No. Dokumen</DetailTableTh>
                        <DetailTableTh>Tanggal</DetailTableTh>
                        <DetailTableTh>No. PO</DetailTableTh>
                        <DetailTableTh>Gudang</DetailTableTh>
                        <DetailTableTh>Status</DetailTableTh>
                      </DetailTableHead>
                      <DetailTableBody>
                        {goodsReceipts.map((gr) => (
                          <DetailTableRow key={gr.id}>
                            <DetailTableTd className="font-mono">{gr.documentNo}</DetailTableTd>
                            <DetailTableTd>{formatDate(gr.date)}</DetailTableTd>
                            <DetailTableTd className="font-mono"><Link href={`/pembelian/pesanan/${gr.purchaseOrder.id}`}>{gr.purchaseOrder.documentNo}</Link></DetailTableTd>
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
            label: `Returns (${purchaseReturns.length})`,
            content: (
              <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
                <div className="flex items-center justify-between p-4 px-5 border-b border-default">
                  <h2 className="text-[0.9375rem] font-semibold text-foreground">Retur Pembelian</h2>
                  <Link href={`/pembelian/retur?cari=${vendor.name}`} className="text-[0.8125rem] text-primary font-medium hover:underline">Lihat Semua →</Link>
                </div>
                <div className="p-4 px-5">
                  {purchaseReturns.length === 0 ? (
                    <p className="flex flex-col items-center justify-center py-16 text-center text-muted">Belum ada retur</p>
                  ) : (
                    <DetailTable>
                      <DetailTableHead>
                        <DetailTableTh>No. Dokumen</DetailTableTh>
                        <DetailTableTh>Tanggal</DetailTableTh>
                        <DetailTableTh>No. PO</DetailTableTh>
                        <DetailTableTh>Status</DetailTableTh>
                      </DetailTableHead>
                      <DetailTableBody>
                        {purchaseReturns.map((pr) => (
                          <DetailTableRow key={pr.id}>
                            <DetailTableTd className="font-mono">{pr.documentNo}</DetailTableTd>
                            <DetailTableTd>{formatDate(pr.date)}</DetailTableTd>
                            <DetailTableTd className="font-mono"><Link href={`/pembelian/pesanan/${pr.purchaseOrder.id}`}>{pr.purchaseOrder.documentNo}</Link></DetailTableTd>
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
            label: `Bills (${vendor.vendorBills.length})`,
            content: (
              <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
                <div className="flex items-center justify-between p-4 px-5 border-b border-default">
                  <h2 className="text-[0.9375rem] font-semibold text-foreground">Tagihan Terbaru</h2>
                  <Link href={`/pembelian/tagihan?cari=${vendor.name}`} className="text-[0.8125rem] text-primary font-medium hover:underline">Lihat Semua →</Link>
                </div>
                <div className="p-4 px-5">
                  {vendor.vendorBills.length === 0 ? (
                    <p className="flex flex-col items-center justify-center py-16 text-center text-muted">Belum ada tagihan</p>
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
                            <DetailTableTd className="font-mono"><Link href={`/pembelian/tagihan/${bill.id}`}>{bill.documentNo}</Link></DetailTableTd>
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
        ]}
      />
    </div>
  )
}
