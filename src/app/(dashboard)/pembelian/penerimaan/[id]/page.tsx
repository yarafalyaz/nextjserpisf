export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { formatCurrency, formatDate } from "@/lib/utils/format"
import Link from "next/link"
import { notFound } from "next/navigation"
import { DeleteButton } from "@/components/ui/delete-button"
import { deleteGoodsReceipt } from "@/actions/purchase.actions"
import { PrintButton } from "@/components/ui/print-button"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { DetailTable, DetailTableHead, DetailTableTh, DetailTableBody, DetailTableRow, DetailTableTd } from "@/components/ui/detail-table"

export default async function GoodsReceiptDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const receipt = await prisma.goodsReceipt.findUnique({
    where: { id: Number(id) },
    include: {
      purchaseOrder: { include: { vendor: true, items: true } },
      warehouse: true,
      items: true,
    },
  })

  if (!receipt) notFound()

  // Load warehouses for per-item display
  const warehouses = await prisma.warehouse.findMany({ select: { id: true, name: true } })
  const warehouseMap = new Map(warehouses.map((w) => [w.id, w.name]))

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[{label:"Dasbor",href:"/"},{label:"Pembelian",href:"/pembelian"},{label:"Penerimaan Barang",href:"/pembelian/penerimaan"},{label:"Detail"}]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Penerimaan Barang {receipt.documentNo}</h1>
        <div className="flex gap-2 items-center">
          <span className={`status-badge status-${receipt.status}`}>{receipt.status}</span>
  <div className="flex gap-2">
          <Link href={`/purchase/goods-receipts/${receipt.id}/edit`} className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all">Edit</Link>
          <PrintButton />
          <DeleteButton id={receipt.id} action={deleteGoodsReceipt} />
                  <Link href="/pembelian/penerimaan" className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:bg-surface-secondary hover:text-foreground transition-all">← Kembali</Link>
        </div>
        </div>
      </div>

      <div className="bg-surface rounded-xl border border-default shadow-sm p-6">
        <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted uppercase tracking-wide">No. Dokumen</span>
            <span className="text-[0.9375rem] text-foreground font-medium font-mono">{receipt.documentNo}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted uppercase tracking-wide">Purchase Order</span>
            <span className="text-[0.9375rem] text-foreground font-medium">
              <Link href={`/purchase/orders/${receipt.purchaseOrder.id}`}>{receipt.purchaseOrder.documentNo}</Link>
            </span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted uppercase tracking-wide">Vendor</span>
            <span className="text-[0.9375rem] text-foreground font-medium">
              <Link href={`/master/vendors/${receipt.purchaseOrder.vendor.id}`}>{receipt.purchaseOrder.vendor.name}</Link>
            </span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted uppercase tracking-wide">Gudang</span>
            <span className="text-[0.9375rem] text-foreground font-medium">
              <Link href={`/master/warehouses/${receipt.warehouse.id}`}>{receipt.warehouse.name}</Link>
            </span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted uppercase tracking-wide">Tanggal</span>
            <span className="text-[0.9375rem] text-foreground font-medium">{formatDate(receipt.date)}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted uppercase tracking-wide">Dibuat</span>
            <span className="text-[0.9375rem] text-foreground font-medium">{formatDate(receipt.createdAt)}</span>
          </div>
        </div>
      </div>

      {/* Items */}
      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
        <div className="flex items-center justify-between p-4 px-5 border-b border-default">
          <h2 className="text-[0.9375rem] font-semibold text-foreground">Item Diterima</h2>
        </div>
        <div className="p-4 px-5">
          {receipt.items.length === 0 ? (
            <p className="flex flex-col items-center justify-center py-16 text-center text-muted">Tidak ada item</p>
          ) : (
            <DetailTable>
              <DetailTableHead>
                <DetailTableTh>Item ID</DetailTableTh>
                <DetailTableTh align="right">Qty Ordered</DetailTableTh>
                <DetailTableTh align="right">Qty Diterima</DetailTableTh>
                <DetailTableTh align="right">Biaya Satuan</DetailTableTh>
                <DetailTableTh>Gudang</DetailTableTh>
                <DetailTableTh>Stock Move</DetailTableTh>
              </DetailTableHead>
              <DetailTableBody>
                {receipt.items.map((item: any) => {
                  const poItem = receipt.purchaseOrder.items?.find((pi: any) => pi.itemId === item.itemId)
                  return (
                    <DetailTableRow key={item.id}>
                      <DetailTableTd>{item.itemId}</DetailTableTd>
                      <DetailTableTd align="right">{item.qtyOrdered != null ? Number(item.qtyOrdered) : (poItem ? Number(poItem.qty) : "-")}</DetailTableTd>
                      <DetailTableTd align="right">{Number(item.qty)}</DetailTableTd>
                      <DetailTableTd align="right">{formatCurrency(Number(item.unitCost))}</DetailTableTd>
                      <DetailTableTd>{warehouseMap.get(item.warehouseId) || receipt.warehouse.name}</DetailTableTd>
                      <DetailTableTd>
                        {item.stockMoveId ? (
                          <Link href={`/inventory/stock-moves?id=${item.stockMoveId}`} className="text-primary hover:underline">SM-{item.stockMoveId}</Link>
                        ) : "-"}
                      </DetailTableTd>
                    </DetailTableRow>
                  )
                })}
              </DetailTableBody>
            </DetailTable>
          )}
        </div>
      </div>

      {/* Notes */}
      {receipt.notes && (
        <div className="bg-surface rounded-xl border border-default shadow-sm p-6">
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted uppercase tracking-wide">Catatan</span>
            <span className="text-[0.9375rem] text-foreground font-medium">{receipt.notes}</span>
          </div>
        </div>
      )}
    </div>
  )
}
