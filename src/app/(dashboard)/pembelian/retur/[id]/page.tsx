export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { formatCurrency, formatDate } from "@/lib/utils/format"
import Link from "next/link"
import { notFound } from "next/navigation"
import { DeleteButton } from "@/components/ui/delete-button"
import { deletePurchaseReturn } from "@/actions/purchase.actions"
import { StatusChip } from "@/components/ui/status-chip"
import { PrintButton } from "@/components/ui/print-button"
import { PageHeader, Button, BackButton } from "@/components/ui/page-header"
import { DetailCard, DetailField } from "@/components/ui/detail-card"
import { DetailTable, DetailTableHead, DetailTableTh, DetailTableBody, DetailTableRow, DetailTableTd } from "@/components/ui/detail-table"

export default async function PurchaseReturnDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const purchaseReturn = await prisma.purchaseReturn.findUnique({
    where: { id: Number(id) },
    include: {
      purchaseOrder: { include: { vendor: true } },
      items: true,
    },
  })

  if (!purchaseReturn) notFound()

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`Retur Pembelian ${purchaseReturn.documentNo}`}
        breadcrumbs={[
          { label: "Dasbor", href: "/" },
          { label: "Pembelian", href: "/pembelian" },
          { label: "Retur", href: "/pembelian/retur" },
          { label: "Detail" },
        ]}
        badge={<StatusChip status={purchaseReturn.status} />}
        actions={
          <>
            <Button href={`/pembelian/retur/${purchaseReturn.id}/ubah`} variant="primary">Ubah</Button>
            <PrintButton />
            <DeleteButton id={purchaseReturn.id} action={deletePurchaseReturn} />
            <BackButton href="/pembelian/retur" />
          </>
        }
      />

      <DetailCard>
        <DetailField label="No. Dokumen" value={purchaseReturn.documentNo} mono />
        <DetailField
          label="Pesanan Pembelian"
          value={<Link href={`/pembelian/pesanan/${purchaseReturn.purchaseOrder.id}`}>{purchaseReturn.purchaseOrder.documentNo}</Link>}
        />
        <DetailField
          label="Pemasok"
          value={<Link href={`/master/pemasok/${purchaseReturn.purchaseOrder.vendor.id}`}>{purchaseReturn.purchaseOrder.vendor.name}</Link>}
        />
        <DetailField label="Tanggal" value={formatDate(purchaseReturn.date)} />
        <DetailField label="Dibuat" value={formatDate(purchaseReturn.createdAt)} />
        <DetailField label="Alasan" value={purchaseReturn.reason || "-"} colSpan="full" />
      </DetailCard>

      {/* Items */}
      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
        <div className="flex items-center justify-between p-4 px-5 border-b border-default">
          <h2 className="text-[0.9375rem] font-semibold text-foreground">Item Retur</h2>
        </div>
        <div className="p-4 px-5">
          {purchaseReturn.items.length === 0 ? (
            <p className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">Tidak ada item</p>
          ) : (
            <DetailTable>
              <DetailTableHead>
                <DetailTableTh>ID Barang</DetailTableTh>
                <DetailTableTh align="right">Jml</DetailTableTh>
                <DetailTableTh align="right">Biaya</DetailTableTh>
              </DetailTableHead>
              <DetailTableBody>
                {purchaseReturn.items.map((item) => (
                  <DetailTableRow key={item.id}>
                    <DetailTableTd>{item.itemId}</DetailTableTd>
                    <DetailTableTd align="right">{Number(item.qty)}</DetailTableTd>
                    <DetailTableTd align="right">{formatCurrency(Number(item.cost))}</DetailTableTd>
                  </DetailTableRow>
                ))}
              </DetailTableBody>
            </DetailTable>
          )}
        </div>
      </div>
    </div>
  )
}
