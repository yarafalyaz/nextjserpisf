export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { formatCurrency, formatDate } from "@/lib/utils/format"
import Link from "next/link"
import { notFound } from "next/navigation"
import { DeleteButton } from "@/components/ui/delete-button"
import { completeSalesReturn, deleteSalesReturn } from "@/actions/sales.actions"
import { StatusChip } from "@/components/ui/status-chip"
import { PrintButton } from "@/components/ui/print-button"
import { ProcessButton } from "@/components/ui/process-button"
import { PageHeader, BackButton } from "@/components/ui/page-header"
import { Button } from "@/components/ui/button"
import { DetailCard, DetailField } from "@/components/ui/detail-card"
import { DetailTable, DetailTableHead, DetailTableTh, DetailTableBody, DetailTableRow, DetailTableTd } from "@/components/ui/detail-table"

import type { Metadata } from "next"

import { requirePermission } from "@/lib/auth/permissions"
import { resolveEntity } from "@/lib/utils/resolve-entity"
import { entityEditHref, entityHref } from "@/lib/utils/entity-url"
export const metadata: Metadata = { title: "Retur" }

export default async function SalesReturnDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  await requirePermission("view_sales_returns")

  const { slug } = await params

  const salesReturn = await resolveEntity(
    { segment: slug, fallbackWhere: {} },
    {
      bySlug: (s, where) =>
        prisma.salesReturn.findFirst({
          where: { slug: s, ...where },
          include: {
            items: true,
            salesInvoice: { select: { id: true, slug: true, documentNo: true } },
            customer: { select: { id: true, slug: true, name: true } },
          },
        }),
      byId: (id, where) =>
        prisma.salesReturn.findUnique({
          where: { id, ...where },
          include: {
            items: true,
            salesInvoice: { select: { id: true, slug: true, documentNo: true } },
            customer: { select: { id: true, slug: true, name: true } },
          },
        }),
    },
  )

  if (!salesReturn) notFound()

  // `SalesReturnItem` tidak punya relasi ke `Item` di skema (hanya `itemId`),
  // jadi nama barangnya diambil lewat satu kueri terpisah.
  const itemIds = [...new Set(salesReturn.items.map((item) => item.itemId))]
  const itemRows = itemIds.length
    ? await prisma.item.findMany({ where: { id: { in: itemIds } }, select: { id: true, name: true, sku: true } })
    : []
  const itemById = new Map(itemRows.map((item) => [item.id, item]))

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
            <Button href={entityEditHref("/penjualan/retur", salesReturn)} variant="primary">Ubah</Button>
            <PrintButton documentType="sales-return" documentId={salesReturn.id} />
            {salesReturn.status !== "completed" && (
              <ProcessButton
                id={salesReturn.id}
                action={completeSalesReturn}
                label="Selesaikan"
                confirmTitle="Selesaikan retur ini?"
                confirmBody="Barang retur akan masuk kembali ke stok dan jurnal retur penjualan diposting. Pastikan retur sudah benar."
                successMessage="Retur berhasil diselesaikan"
              />
            )}
            <DeleteButton id={salesReturn.id} action={deleteSalesReturn} />
            <BackButton href="/penjualan/retur" />
          </>
        }
      />

      <DetailCard>
        <DetailField label="No. Dokumen" value={salesReturn.documentNo} mono />
        <DetailField label="Tanggal" value={formatDate(salesReturn.date)} />
        <DetailField label="Dibuat" value={formatDate(salesReturn.createdAt)} />
        <DetailField
          label="Pelanggan"
          value={
            <Link href={entityHref("/master/pelanggan", salesReturn.customer)}>
              {salesReturn.customer.name}
            </Link>
          }
        />
        <DetailField
          label="Faktur"
          value={
            salesReturn.salesInvoice ? (
              <Link href={entityHref("/penjualan/faktur", salesReturn.salesInvoice)}>
                {salesReturn.salesInvoice.documentNo}
              </Link>
            ) : (
              "-"
            )
          }
        />
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
                <DetailTableTh>Barang</DetailTableTh>
                <DetailTableTh>SKU</DetailTableTh>
                <DetailTableTh align="right">Jml</DetailTableTh>
                <DetailTableTh align="right">Biaya</DetailTableTh>
              </DetailTableHead>
              <DetailTableBody>
                {salesReturn.items.map((item) => (
                  <DetailTableRow key={item.id}>
                    <DetailTableTd>{itemById.get(item.itemId)?.name ?? `Item #${item.itemId}`}</DetailTableTd>
                    <DetailTableTd className="font-mono">{itemById.get(item.itemId)?.sku ?? "-"}</DetailTableTd>
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
