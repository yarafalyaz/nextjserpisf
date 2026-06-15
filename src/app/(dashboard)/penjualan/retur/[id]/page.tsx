export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { formatCurrency, formatDate } from "@/lib/utils/format"
import { notFound } from "next/navigation"
import { DeleteButton } from "@/components/ui/delete-button"
import { deleteSalesReturn } from "@/actions/sales.actions"
import { StatusChip } from "@/components/ui/status-chip"
import { PrintButton } from "@/components/ui/print-button"
import { PageHeader, BackButton } from "@/components/ui/page-header"
import { Button } from "@/components/ui/button"
import { DetailCard, DetailField } from "@/components/ui/detail-card"
import { DetailTable, DetailTableHead, DetailTableTh, DetailTableBody, DetailTableRow, DetailTableTd } from "@/components/ui/detail-table"

import type { Metadata } from "next"

import { requirePermission } from "@/lib/auth/permissions"
export const metadata: Metadata = { title: "Retur" }

export default async function SalesReturnDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requirePermission("view_sales_orders")

  const { id } = await params

  const salesReturn = await prisma.salesReturn.findUnique({
    where: { id: Number(id) },
    include: {
      items: true,
    },
  })

  if (!salesReturn) notFound()

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`Retur Penjualan ${salesReturn.documentNo}`}
        breadcrumbs={[
          { label: "Dasbor", href: "/" },
          { label: "Penjualan", href: "/penjualan" },
          { label: "Retur", href: "/penjualan/retur" },
          { label: "Detail" },
        ]}
        badge={<StatusChip status={salesReturn.status} />}
        actions={
          <>
            <Button href={`/penjualan/retur/${salesReturn.id}/ubah`} variant="primary">Ubah</Button>
            <PrintButton />
            <DeleteButton id={salesReturn.id} action={deleteSalesReturn} />
            <BackButton href="/penjualan/retur" />
          </>
        }
      />

      <DetailCard>
        <DetailField label="No. Dokumen" value={salesReturn.documentNo} mono />
        <DetailField label="Tanggal" value={formatDate(salesReturn.date)} />
        <DetailField label="Dibuat" value={formatDate(salesReturn.createdAt)} />
        <DetailField label="Alasan" value={salesReturn.reason || "-"} colSpan="full" />
      </DetailCard>

      {/* Items */}
      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
        <div className="flex items-center justify-between p-4 px-5 border-b border-default">
          <h2 className="text-[0.9375rem] font-semibold text-foreground">Item Retur</h2>
        </div>
        <div className="p-4 px-5">
          {salesReturn.items.length === 0 ? (
            <p className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">Tidak ada item</p>
          ) : (
            <DetailTable>
              <DetailTableHead>
                <DetailTableTh>ID Barang</DetailTableTh>
                <DetailTableTh align="right">Jml</DetailTableTh>
                <DetailTableTh align="right">Biaya</DetailTableTh>
              </DetailTableHead>
              <DetailTableBody>
                {salesReturn.items.map((item) => (
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
