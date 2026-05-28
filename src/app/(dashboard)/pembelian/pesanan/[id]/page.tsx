export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { formatCurrency, formatDate } from "@/lib/utils/format"
import Link from "next/link"
import { notFound } from "next/navigation"
import { StatusChip } from "@/components/ui/status-chip"
import { DetailTabs } from "@/components/ui/detail-tabs"
import { DeleteButton } from "@/components/ui/delete-button"
import { deletePurchaseOrder } from "@/actions/purchase.actions"
import { StatusActions } from "@/components/ui/status-actions"
import { PrintButton } from "@/components/ui/print-button"
import { PageHeader, Button, BackButton } from "@/components/ui/page-header"
import { DetailCard, DetailField } from "@/components/ui/detail-card"
import { DetailTable, DetailTableHead, DetailTableTh, DetailTableBody, DetailTableRow, DetailTableTd, DetailTableFoot, DetailTableFootRow } from "@/components/ui/detail-table"

export default async function PurchaseOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requirePermission("view_purchase_orders")
  const { id } = await params

  const po = await prisma.purchaseOrder.findUnique({
    where: { id: Number(id) },
    include: {
      vendor: true,
      purchaseRequest: true,
      items: true,
      goodsReceipts: { include: { items: true } },
      purchaseReturns: true,
    },
  })

  if (!po) notFound()

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`PO ${po.documentNo}`}
        breadcrumbs={[
          { label: "Dashboard", href: "/" },
          { label: "Purchase", href: "/pembelian" },
          { label: "Orders", href: "/pembelian/pesanan" },
          { label: "Detail" },
        ]}
        badge={<StatusChip status={po.status} />}
        actions={
          <>
            <Button href={`/pembelian/pesanan/${po.id}/ubah`} variant="primary">Ubah</Button>
            <PrintButton />
            <DeleteButton id={po.id} action={deletePurchaseOrder} />
            <BackButton href="/pembelian/pesanan" />
          </>
        }
      />

      <DetailTabs
        ariaLabel="Purchase order detail tabs"
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
                />
                <DetailCard>
                  <DetailField label="Pemasok" value={po.vendor.name} />
                  <DetailField label="Tanggal" value={formatDate(po.date)} />
                  <DetailField label="Expected" value={formatDate(po.expectedDate)} />
                  <DetailField label="PR Ref" value={po.purchaseRequest?.documentNo || "-"} mono />
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
            label: "Items",
            content: (
              <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
                <div className="flex items-center justify-between p-4 px-5 border-b border-default">
                  <h2 className="text-[0.9375rem] font-semibold text-foreground">Barang</h2>
                </div>
                <div className="p-4 px-5">
                  <DetailTable>
                    <DetailTableHead>
                      <DetailTableTh>Item ID</DetailTableTh>
                      <DetailTableTh align="right">Qty</DetailTableTh>
                      <DetailTableTh align="right">Received</DetailTableTh>
                      <DetailTableTh align="right">Harga</DetailTableTh>
                      <DetailTableTh align="right">Total</DetailTableTh>
                    </DetailTableHead>
                    <DetailTableBody>
                      {po.items.map((item) => (
                        <DetailTableRow key={item.id}>
                          <DetailTableTd>Item #{item.itemId}</DetailTableTd>
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
                <div className="flex items-center justify-between p-4 px-5 border-b border-default">
                  <h2 className="text-[0.9375rem] font-semibold text-foreground">Penerimaan Barang</h2>
                  {po.status === "ordered" && (
                    <Link href={`/pembelian/penerimaan/tambah?poId=${po.id}`} className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border border-default transition-all hover:bg-surface-secondary">+ Buat GR</Link>
                  )}
                </div>
                <div className="p-4 px-5">
                  {po.goodsReceipts.length === 0 ? (
                    <p className="flex flex-col items-center justify-center py-16 text-center text-muted">Belum ada goods receipt</p>
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
                            <DetailTableTd className="font-mono"><Link href={`/pembelian/penerimaan/${gr.id}`}>{gr.documentNo}</Link></DetailTableTd>
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
        ]}
      />
    </div>
  )
}
