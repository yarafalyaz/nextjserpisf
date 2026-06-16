/* eslint-disable @typescript-eslint/no-explicit-any */
export const dynamic = "force-dynamic"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Faktur Penjualan" }

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { formatCurrency, formatDate } from "@/lib/utils/format"
import Link from "next/link"
import { notFound } from "next/navigation"
import { StatusChip } from "@/components/ui/status-chip"
import { DetailTabs } from "@/components/ui/detail-tabs"
import { DeleteButton } from "@/components/ui/delete-button"
import { deleteSalesInvoice, voidSalesInvoice } from "@/actions/sales.actions"
import { VoidButton } from "@/components/ui/void-button"
import { StatusActions } from "@/components/ui/status-actions"
import { PrintButton } from "@/components/ui/print-button"
import { PageHeader, BackButton } from "@/components/ui/page-header"
import { Button } from "@/components/ui/button"
import { DetailCard, DetailField } from "@/components/ui/detail-card"
import { TransactionAttachments } from "@/components/ui/transaction-attachments"
import { InvoiceItemsEditor } from "@/components/ui/invoice-items-editor"
import { DetailTable, DetailTableHead, DetailTableTh, DetailTableBody, DetailTableRow, DetailTableTd, DetailTableFoot, DetailTableFootRow } from "@/components/ui/detail-table"
import { getPaymentMethodMap, resolvePaymentMethodName } from "@/lib/services/method.service"

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requirePermission("view_sales_invoices")
  const { id } = await params
  const numId = Number(id)
  if (Number.isNaN(numId)) notFound()

  const invoice = await prisma.salesInvoice.findUnique({
    where: { id: numId },
    include: {
      customer: true,
      salesOrder: true,
      quotation: { include: { downPayments: { orderBy: { paymentDate: "asc" } } } },
      items: true,
      payments: true,
    },
  })

  if (!invoice) notFound()

  // Fetch available items for the editor (termasuk metadata UoM & serial)
  const availableItems = await prisma.item.findMany({
    where: { isActive: true },
    select: {
      id: true,
      name: true,
      sku: true,
      price: true,
      unitOfMeasure: true,
      trackSerial: true,
      uomConversions: { select: { code: true, factorToBase: true } },
    },
    orderBy: { name: "asc" },
  })

  const pmMap = await getPaymentMethodMap()

  // Derive the effective tax RATE from taxAmount (reliably the PPN amount on
  // every write path) over the taxable base. Reading invoice.tax directly is
  // unsafe: it holds the amount on DP/quotation-created invoices but the rate
  // after updateSalesInvoice, so the editor could be prefilled with the amount
  // (e.g. 55000) as if it were a rate (e.g. 11). This derivation is correct in
  // both cases. Rounded to 2 decimals to absorb float noise.
  const taxBase = Number(invoice.subtotal ?? 0) - Number(invoice.discount ?? 0)
  const derivedTaxRate = taxBase > 0
    ? Math.round((Number(invoice.taxAmount ?? 0) / taxBase) * 10000) / 100
    : 0
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`Faktur ${invoice.documentNo}`}
        breadcrumbs={[
          { label: "Dasbor", href: "/" },
          { label: "Penjualan", href: "/penjualan" },
          { label: "Faktur", href: "/penjualan/faktur" },
          { label: "Detail" },
        ]}
        badge={<StatusChip status={invoice.status} />}
        actions={
          <>
            <Button href={`/penjualan/faktur/${invoice.id}/ubah`} variant="primary">Ubah</Button>
            {invoice.status !== "paid" && invoice.status !== "cancelled" && (
              <Button href={`/penjualan/pembayaran/tambah?invoiceId=${invoice.id}`} variant="primary" className="bg-[var(--color-success)] text-white">
                Terima Pembayaran
              </Button>
            )}
            {invoice.status === "paid" && (
              <Button href={`/penjualan/surat-jalan/tambah?fakturPenjualanId=${invoice.id}`} variant="primary">+ Surat Jalan</Button>
            )}
            <PrintButton documentType="invoice" documentId={invoice.id} />
            {invoice.status !== "draft" && invoice.status !== "cancelled" && (
              <VoidButton id={invoice.id} action={voidSalesInvoice} />
            )}
            <DeleteButton id={invoice.id} action={deleteSalesInvoice} />
            <BackButton href="/penjualan/faktur" />
          </>
        }
      />

      <DetailTabs
        ariaLabel="Tab detail faktur"
        tabs={[
          {
            id: "info",
            label: "Info",
            content: (
              <>
                <StatusActions
                  status={invoice.status}
                  id={invoice.id}
                  module="penjualan/faktur"
                />
                <DetailCard>
                  <DetailField label="Pelanggan" value={invoice.customer.name} />
                  <DetailField label="Tanggal" value={formatDate(invoice.date)} />
                  <DetailField label="Jatuh Tempo" value={formatDate(invoice.dueDate)} />
                  <DetailField label="Pesanan Penjualan" value={invoice.salesOrder?.documentNo || "-"} mono />
                  <DetailField label="Penawaran" value={invoice.quotation?.documentNo || "-"} mono />
                  <DetailField label="Status Bayar" value={invoice.paymentStatus || "-"} />
                </DetailCard>

                {/* Notes */}
                {invoice.notes && (
                  <DetailCard>
                    <DetailField label="Catatan" value={invoice.notes} colSpan="full" />
                  </DetailCard>
                )}
              </>
            ),
          },
          {
            id: "items",
            label: "Item",
            content: (
              <InvoiceItemsEditor
                invoiceId={invoice.id}
                customerId={invoice.customerId}
                salesOrderId={invoice.salesOrderId}
                quotationId={invoice.quotationId}
                date={invoice.date.toISOString().split("T")[0]}
                dueDate={invoice.dueDate?.toISOString().split("T")[0]}
                taxRate={derivedTaxRate}
                discountTotal={Number(invoice.discount ?? 0)}
                items={invoice.items.map((item) => ({
                  id: item.id,
                  itemId: item.itemId,
                  description: item.description || `Item #${item.itemId}`,
                  qty: Number(item.qty),
                  unitPrice: Number(item.unitPrice),
                  discount: Number(item.discount ?? 0),
                  total: Number(item.total),
                  uom: item.uom ?? null,
                  serialNumbers: Array.isArray(item.serialNumbers)
                    ? (item.serialNumbers as unknown[]).map((s) => String(s))
                    : [],
                }))}
                availableItems={availableItems.map((i) => ({
                  id: i.id,
                  name: i.name,
                  sku: i.sku,
                  price: Number(i.price ?? 0),
                  unitOfMeasure: i.unitOfMeasure,
                  trackSerial: i.trackSerial,
                  uomConversions: i.uomConversions.map((c) => ({ code: c.code, factorToBase: Number(c.factorToBase) })),
                }))}
                paidAmount={Number(invoice.paidAmount ?? 0)}
                editable={invoice.status !== "paid" && invoice.status !== "cancelled"}
              />
            ),
          },
          {
            id: "down-payment",
            label: "Uang Muka",
            content: (
              <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
                <div className="flex items-center justify-between p-4 px-5 border-b border-default">
                  <h2 className="text-[0.9375rem] font-semibold text-foreground">Riwayat Uang Muka</h2>
                </div>
                <div className="p-4 px-5">
                  {(!invoice.quotation?.downPayments || invoice.quotation.downPayments.length === 0) ? (
                    <p className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">Tidak ada uang muka</p>
                  ) : (
                    <>
                      <DetailTable>
                        <DetailTableHead>
                          <DetailTableTh>No. Dokumen</DetailTableTh>
                          <DetailTableTh>Tanggal</DetailTableTh>
                          <DetailTableTh>Metode</DetailTableTh>
                          <DetailTableTh>Status</DetailTableTh>
                          <DetailTableTh align="right">Nominal</DetailTableTh>
                        </DetailTableHead>
                        <DetailTableBody>
                          {invoice.quotation.downPayments.map((dp: any) => (
                            <DetailTableRow key={dp.id}>
                              <DetailTableTd className="font-mono">{dp.documentNo}</DetailTableTd>
                              <DetailTableTd>{formatDate(dp.paymentDate)}</DetailTableTd>
                              <DetailTableTd>{resolvePaymentMethodName(dp.paymentMethod, pmMap)}</DetailTableTd>
                              <DetailTableTd><StatusChip status={dp.status} /></DetailTableTd>
                              <DetailTableTd align="right">{formatCurrency(Number(dp.amount))}</DetailTableTd>
                            </DetailTableRow>
                          ))}
                        </DetailTableBody>
                        <DetailTableFoot>
                          <DetailTableFootRow>
                            <DetailTableTd colSpan={4} align="right" className="font-bold">Total DP</DetailTableTd>
                            <DetailTableTd align="right" className="font-bold">{formatCurrency(invoice.quotation.downPayments.reduce((sum: number, dp: any) => sum + Number(dp.amount), 0))}</DetailTableTd>
                          </DetailTableFootRow>
                          <DetailTableFootRow>
                            <DetailTableTd colSpan={4} align="right">Total Keseluruhan Faktur</DetailTableTd>
                            <DetailTableTd align="right">{formatCurrency(Number(invoice.grandTotal))}</DetailTableTd>
                          </DetailTableFootRow>
                          <DetailTableFootRow>
                            <DetailTableTd colSpan={4} align="right" className="text-danger font-bold">Sisa Setelah DP</DetailTableTd>
                            <DetailTableTd align="right" className="text-danger font-bold">{formatCurrency(Number(invoice.grandTotal) - invoice.quotation.downPayments.reduce((sum: number, dp: any) => sum + Number(dp.amount), 0))}</DetailTableTd>
                          </DetailTableFootRow>
                        </DetailTableFoot>
                      </DetailTable>
                    </>
                  )}
                </div>
              </div>
            ),
          },
          {
            id: "pembayaran",
            label: "Pembayaran",
            content: (
              <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
                <div className="flex items-center justify-between p-4 px-5 border-b border-default">
                  <h2 className="text-[0.9375rem] font-semibold text-foreground">Riwayat Pembayaran</h2>
                  {(invoice.status === "posted" || invoice.status === "partial") && (
                    <Link href={`/penjualan/pembayaran/tambah?invoiceId=${invoice.id}`} className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border border-default transition-all hover:bg-surface-secondary">+ Terima Bayar</Link>
                  )}
                </div>
                <div className="p-4 px-5">
                  {invoice.payments.length === 0 ? (
                    <p className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">Belum ada pembayaran</p>
                  ) : (
                    <DetailTable>
                      <DetailTableHead>
                        <DetailTableTh>No. Dokumen</DetailTableTh>
                        <DetailTableTh>Tanggal</DetailTableTh>
                        <DetailTableTh>Metode</DetailTableTh>
                        <DetailTableTh align="right">Jumlah</DetailTableTh>
                      </DetailTableHead>
                      <DetailTableBody>
                        {invoice.payments.map((pay) => (
                          <DetailTableRow key={pay.id}>
                            <DetailTableTd className="font-mono">{pay.documentNo}</DetailTableTd>
                            <DetailTableTd>{formatDate(pay.paymentDate)}</DetailTableTd>
                            <DetailTableTd>{resolvePaymentMethodName(pay.paymentMethod, pmMap)}</DetailTableTd>
                            <DetailTableTd align="right">{formatCurrency(Number(pay.amount))}</DetailTableTd>
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
            id: "lampiran",
            label: "Lampiran",
            content: (
              <TransactionAttachments referenceType="sales_invoice" referenceId={invoice.id} />
            ),
          },
        ]}
      />
    </div>
  )
}
