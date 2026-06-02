export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { formatCurrency, formatDate } from "@/lib/utils/format"
import Link from "next/link"
import { notFound } from "next/navigation"
import { Pencil } from "lucide-react"
import { StatusChip } from "@/components/ui/status-chip"
import { DetailTabs } from "@/components/ui/detail-tabs"
import { StatusActions } from "@/components/ui/status-actions"
import { PrintButton } from "@/components/ui/print-button"
import { PageHeader, Button, BackButton } from "@/components/ui/page-header"
import { DetailCard, DetailField } from "@/components/ui/detail-card"
import { DetailTable, DetailTableHead, DetailTableTh, DetailTableBody, DetailTableRow, DetailTableTd } from "@/components/ui/detail-table"

export default async function QuotationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requirePermission("view_quotations")
  const { id } = await params

  const quotation = await prisma.quotation.findUnique({
    where: { id: Number(id), deletedAt: null },
    include: {
      customer: true,
      sections: { include: { items: true }, orderBy: { sortOrder: "asc" } },
      downPayments: true,
      histories: { orderBy: { createdAt: "desc" }, take: 10 },
    },
  })

  if (!quotation) notFound()

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`Quotation ${quotation.documentNo}`}
        breadcrumbs={[
          { label: "Dashboard", href: "/" },
          { label: "Sales", href: "/penjualan" },
          { label: "Quotations", href: "/penjualan/penawaran" },
          { label: "Detail" },
        ]}
        badge={<StatusChip status={quotation.status} />}
        actions={
          <>
            <Button href={`/penjualan/penawaran/${id}/ubah`} variant="secondary"><Pencil size={14} /> Edit</Button>
            <PrintButton documentType="quotation" documentId={quotation.id} />
            {quotation.status === "approved" && (
              <Button href={`/penjualan/pesanan/tambah?penawaranId=${id}`} variant="primary">+ Pesanan Penjualan</Button>
            )}
            <BackButton href="/penjualan/penawaran" />
          </>
        }
      />

      <DetailTabs
        ariaLabel="Quotation detail tabs"
        tabs={[
          {
            id: "info",
            label: "Info",
            content: (
              <>
                <StatusActions
                  status={quotation.status}
                  id={quotation.id}
                  module="penjualan/penawaran"
                />
                <DetailCard>
                  <DetailField
                    label="Pelanggan"
                    value={<Link href={`/master/pelanggan/${quotation.customerId}`}>{quotation.customer.name}</Link>}
                  />
                  <DetailField label="Tanggal" value={formatDate(quotation.date)} />
                  <DetailField label="Valid Sampai" value={formatDate(quotation.validUntil)} />
                  <DetailField label="Total Keseluruhan" value={formatCurrency(Number(quotation.grandTotal))} />
                </DetailCard>

                {/* Summary */}
                <DetailCard columns={4}>
                  <DetailField label="Subtotal" value={formatCurrency(Number(quotation.subtotal))} />
                  <DetailField label="Diskon" value={formatCurrency(Number(quotation.discount))} />
                  <DetailField label="Pajak" value={formatCurrency(Number(quotation.tax))} />
                  <DetailField label="Total Keseluruhan" value={<span className="text-xl">{formatCurrency(Number(quotation.grandTotal))}</span>} />
                </DetailCard>

                {/* Notes */}
                {quotation.notes && (
                  <DetailCard>
                    <DetailField label="Catatan" value={quotation.notes} colSpan="full" />
                  </DetailCard>
                )}
              </>
            ),
          },
          {
            id: "items",
            label: "Items",
            content: (
              <>
                {/* Sections & Items */}
                {quotation.sections.map((section) => (
                  <div key={section.id} className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
                    <div className="flex items-center justify-between p-4 px-5 border-b border-default">
                      <h2 className="text-[0.9375rem] font-semibold text-foreground">{section.name}</h2>
                    </div>
                    <div className="p-4 px-5">
                      <DetailTable>
                        <DetailTableHead>
                          <DetailTableTh>Deskripsi</DetailTableTh>
                          <DetailTableTh align="right">Qty</DetailTableTh>
                          <DetailTableTh>UoM</DetailTableTh>
                          <DetailTableTh align="right">Harga</DetailTableTh>
                          <DetailTableTh align="right">Diskon</DetailTableTh>
                          <DetailTableTh align="right">Total</DetailTableTh>
                        </DetailTableHead>
                        <DetailTableBody>
                          {section.items.map((item) => (
                            <DetailTableRow key={item.id}>
                              <DetailTableTd>{item.description || "-"}</DetailTableTd>
                              <DetailTableTd align="right">{Number(item.qty)}</DetailTableTd>
                              <DetailTableTd>{item.uom || "-"}</DetailTableTd>
                              <DetailTableTd align="right">{formatCurrency(Number(item.unitPrice))}</DetailTableTd>
                              <DetailTableTd align="right">{formatCurrency(Number(item.discount))}</DetailTableTd>
                              <DetailTableTd align="right">{formatCurrency(Number(item.total))}</DetailTableTd>
                            </DetailTableRow>
                          ))}
                        </DetailTableBody>
                      </DetailTable>
                    </div>
                  </div>
                ))}

                {/* Down Payments */}
                {quotation.downPayments.length > 0 && (
                  <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
                    <div className="flex items-center justify-between p-4 px-5 border-b border-default">
                      <h2 className="text-[0.9375rem] font-semibold text-foreground">Uang Muka</h2>
                    </div>
                    <div className="p-4 px-5">
                      <DetailTable>
                        <DetailTableHead>
                          <DetailTableTh>Jumlah</DetailTableTh>
                          <DetailTableTh>Status</DetailTableTh>
                          <DetailTableTh>Dibuat</DetailTableTh>
                        </DetailTableHead>
                        <DetailTableBody>
                          {quotation.downPayments.map((dp) => (
                            <DetailTableRow key={dp.id}>
                              <DetailTableTd>{formatCurrency(Number(dp.amount))}</DetailTableTd>
                              <DetailTableTd><StatusChip status={dp.status} /></DetailTableTd>
                              <DetailTableTd>{formatDate(dp.createdAt)}</DetailTableTd>
                            </DetailTableRow>
                          ))}
                        </DetailTableBody>
                      </DetailTable>
                    </div>
                  </div>
                )}
              </>
            ),
          },
          {
            id: "history",
            label: "History",
            content: (
              <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
                <div className="flex items-center justify-between p-4 px-5 border-b border-default">
                  <h2 className="text-[0.9375rem] font-semibold text-foreground">Riwayat</h2>
                </div>
                <div className="p-4 px-5">
                  {quotation.histories.length === 0 ? (
                    <p className="flex flex-col items-center justify-center py-16 text-center text-muted">Belum ada riwayat</p>
                  ) : (
                    quotation.histories.map((h) => (
                      <div key={h.id} className="py-2 border-b border-default text-[0.8125rem]">
                        <strong>{h.action}</strong> — {h.description || ""} <span className="text-muted">({formatDate(h.createdAt)})</span>
                      </div>
                    ))
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
