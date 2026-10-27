export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { formatCurrency, formatDate } from "@/lib/utils/format"
import Link from "next/link"
import { notFound } from "next/navigation"
import { DeleteButton } from "@/components/ui/delete-button"
import { ProcessButton } from "@/components/ui/process-button"
import { deletePurchaseReturn, processPurchaseReturn } from "@/actions/purchase.actions"
import { StatusChip } from "@/components/ui/status-chip"
import { PrintButton } from "@/components/ui/print-button"
import { PageHeader, BackButton } from "@/components/ui/page-header"
import { Button } from "@/components/ui/button"
import { DetailCard, DetailField } from "@/components/ui/detail-card"
import { DetailTable, DetailTableHead, DetailTableTh, DetailTableBody, DetailTableRow, DetailTableTd } from "@/components/ui/detail-table"
import { EmptyState } from "@/components/ui/empty-state"

import type { Metadata } from "next"

import { requirePermission } from "@/lib/auth/permissions"
import { resolveEntity } from "@/lib/utils/resolve-entity"
import { entityHref, entityEditHref } from "@/lib/utils/entity-url"
import { CanCreate } from "@/components/auth/can-create"
export const metadata: Metadata = { title: "Retur" }

export default async function PurchaseReturnDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  await requirePermission("view_purchase_returns")

  const { slug } = await params

  const purchaseReturn = await resolveEntity(
    { segment: slug, fallbackWhere: {} },
    {
      bySlug: (s, where) =>
        prisma.purchaseReturn.findFirst({
          where: { slug: s, ...where },
          include: {
            purchaseOrder: { include: { vendor: true } },
            items: true,
          },
        }),
      byId: (id, where) =>
        prisma.purchaseReturn.findUnique({
          where: { id, ...where },
          include: {
            purchaseOrder: { include: { vendor: true } },
            items: true,
          },
        }),
    },
  )

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
            <CanCreate permission="edit_purchase_returns">
              <Button href={entityEditHref("/pembelian/retur", purchaseReturn)} variant="primary">Ubah</Button>
            </CanCreate>
            <PrintButton documentType="purchase-return" documentId={purchaseReturn.id} />
            {/* processPurchaseReturn hanya menerima status draft (stok + jurnal). */}
            {purchaseReturn.status === "draft" && (
              <ProcessButton
                id={purchaseReturn.id}
                action={processPurchaseReturn}
                label="Proses Retur"
                confirmTitle="Proses retur ini?"
                confirmBody="Stok akan dikembalikan ke pemasok dan jurnal pembaliknya diposting. Jalankan setelah barang benar-benar dikirim."
                successMessage="Retur berhasil diproses"
              />
            )}
            <CanCreate permission="delete_purchase_returns">
              <DeleteButton id={purchaseReturn.id} action={deletePurchaseReturn} />
            </CanCreate>
            <BackButton href="/pembelian/retur" />
          </>
        }
      />

      <DetailCard>
        <DetailField label="No. Dokumen" value={purchaseReturn.documentNo} mono />
        <DetailField
          label="Pesanan Pembelian"
          value={<Link href={entityHref("/pembelian/pesanan", purchaseReturn.purchaseOrder)}>{purchaseReturn.purchaseOrder.documentNo}</Link>}
        />
        <DetailField
          label="Pemasok"
          value={<Link href={entityHref("/master/vendor", purchaseReturn.purchaseOrder.vendor)}>{purchaseReturn.purchaseOrder.vendor.name}</Link>}
        />
        <DetailField label="Tanggal" value={formatDate(purchaseReturn.date)} />
        <DetailField label="Dibuat" value={formatDate(purchaseReturn.createdAt)} />
        <DetailField label="Alasan" value={purchaseReturn.reason || "-"} colSpan="full" />
        <DetailField label="Nomor Nota Retur Pajak" value={purchaseReturn.taxReturnNoteNumber || "-"} mono />
        <DetailField label="Tanggal Nota Retur Pajak" value={purchaseReturn.taxReturnNoteDate ? formatDate(purchaseReturn.taxReturnNoteDate) : "-"} />
      </DetailCard>

      {/* Items */}
      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-4 p-4 px-5 border-b border-default">
          <h2 className="text-[0.9375rem] font-semibold text-foreground">Item Retur</h2>
        </div>
        <div className="p-4 px-5">
          {purchaseReturn.items.length === 0 ? (
            <EmptyState title="Tidak ada item" />
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
