 
export const dynamic = "force-dynamic"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Faktur Penjualan" }

import { prisma } from "@/lib/db/prisma"
import { hasPermission, requirePermission } from "@/lib/auth/permissions"
import { formatCurrency, formatDate, formatPercentage } from "@/lib/utils/format"
import Link from "next/link"
import { notFound } from "next/navigation"
import { StatusChip } from "@/components/ui/status-chip"
import { entityHref } from "@/lib/utils/entity-url"
import { DetailTabs } from "@/components/ui/detail-tabs"
import { DeleteButton } from "@/components/ui/delete-button"
import { deleteSalesInvoice, postInvoice, voidSalesInvoice } from "@/actions/sales.actions"
import { VoidButton } from "@/components/ui/void-button"

import { PrintButton } from "@/components/ui/print-button"
import { ProcessButton } from "@/components/ui/process-button"
import { WhatsappButton } from "@/components/reports/whatsapp-button"
import { WhatsappTrailNote } from "@/components/reports/whatsapp-trail-note"
import { getWhatsappTrail } from "@/lib/reports/whatsapp-trail-data"
import { buildWhatsappMessage } from "@/lib/utils/whatsapp"
import { salesInvoiceLabel } from "@/lib/utils/invoice-label"
import { PageHeader, BackButton } from "@/components/ui/page-header"
import { Button } from "@/components/ui/button"
import { DetailCard, DetailField } from "@/components/ui/detail-card"
import { EmptyState } from "@/components/ui/empty-state"
import { TransactionAttachments } from "@/components/ui/transaction-attachments"
import { LockedDocNotice } from "@/components/ui/locked-edit-guard"
import { InvoiceItemsEditor } from "@/components/ui/invoice-items-editor"
import { DetailTable, DetailTableHead, DetailTableTh, DetailTableBody, DetailTableRow, DetailTableTd, DetailTableFoot, DetailTableFootRow } from "@/components/ui/detail-table"
import { getPaymentMethodMap, resolvePaymentMethodName } from "@/lib/services/method.service"
import { resolveEntity } from "@/lib/utils/resolve-entity"
import { entityEditHref } from "@/lib/utils/entity-url"
import { DELIVERABLE_ORDER_STATUSES } from "@/lib/validations/sales.schemas"
import { CanCreate } from "@/components/auth/can-create"
import { SalesLateFeePanel } from "@/components/reports/sales-late-fee-panel"
import { getSalesLateFeePanelForInvoice } from "@/lib/reports/sales-late-fee-data"

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  await requirePermission("view_sales_invoices")
  const { slug } = await params

  const invoice = await resolveEntity(
    { segment: slug, fallbackWhere: {} },
    {
      bySlug: (s, where) =>
        prisma.salesInvoice.findFirst({
          where: { slug: s, ...where },
          include: {
            customer: true,
            salesOrder: true,
            // F-2026-10-25-036-S: nama kategori snapshot tarif komisi (beku).
            commissionCustomerCategory: { select: { name: true } },
            quotation: { include: { downPayments: { orderBy: { paymentDate: "asc" } } } },
            items: true,
            payments: true,
            // Retur penjualan yang menunjuk faktur ini — rantai balik faktur ->
            // retur supaya pemakai tidak perlu mencari di menu Retur.
            salesReturns: {
              orderBy: { date: "desc" },
              select: { id: true, documentNo: true, date: true, status: true },
            },
          },
        }),
      byId: (id, where) =>
        prisma.salesInvoice.findUnique({
          where: { id, ...where },
          include: {
            customer: true,
            salesOrder: true,
            // F-2026-10-25-036-S: nama kategori snapshot tarif komisi (beku).
            commissionCustomerCategory: { select: { name: true } },
            quotation: { include: { downPayments: { orderBy: { paymentDate: "asc" } } } },
            items: true,
            payments: true,
            // Retur penjualan yang menunjuk faktur ini — rantai balik faktur ->
            // retur supaya pemakai tidak perlu mencari di menu Retur.
            salesReturns: {
              orderBy: { date: "desc" },
              select: { id: true, documentNo: true, date: true, status: true },
            },
          },
        }),
    },
  )

  if (!invoice) notFound()

  // Dokumen denda piutang (F-2026-10-22-093-V): tab hanya untuk pemegang
  // view_sales_late_fees; loader menegakkan izin yang sama fail-closed.
  const [canViewLateFees, canCreateLateFee, canReverseLateFee] =
    await Promise.all([
      hasPermission("view_sales_late_fees"),
      hasPermission("create_sales_late_fees"),
      hasPermission("delete_sales_late_fees"),
    ])
  const lateFeeBundle = canViewLateFees
    ? await getSalesLateFeePanelForInvoice(invoice.id)
    : null

  // F-036 tahap 2: jejak klik tautan WA terakhir (label jujur, bukan terkirim).
  const whatsappTrail = await getWhatsappTrail("SalesInvoice", invoice.id)

  // Custom fabrication: items stay editable until the customer actually pays.
  // A down payment is only an advance (reconciled at the end) — it does NOT lock
  // the item list. So the editor stays open while the only payments are DP rows,
  // and locks as soon as a real (non-DP) payment exists (or the invoice is
  // cancelled).
  const hasRealPayment = invoice.payments.some((p) => p.paymentMethod !== "down_payment")
  const itemsEditable = invoice.status !== "cancelled" && !hasRealPayment
  // GL-BR-003 K1 (cermin guard server updateSalesInvoice fail-closed):
  // header Ubah disembunyikan bila server pasti menolak (cancelled atau
  // sudah ada pelunasan nyata). posted/partial/paid tanpa pelunasan nyata
  // tetap boleh Ubah (server izinkan), dengan Void + Retur sebagai jalur K2.

  // Fetch available items for the editor (termasuk metadata UoM & serial)
  const availableItems = await prisma.item.findMany({
    where: { isActive: true, deletedAt: null },
    select: {
      id: true,
      name: true,
      sku: true,
      price: true,
      unitOfMeasure: true,
      trackSerial: true,
      isScrapSaleItem: true,
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
            {/* GL-BR-003 K1: cermin guard server updateSalesInvoice
                (cancelled/setelah-pelunasan-nyata pasti ditolak). */}
            {itemsEditable && (
              <CanCreate permission="edit_sales_invoices">
                <Button href={entityEditHref("/penjualan/faktur", invoice)} variant="primary">Ubah</Button>
              </CanCreate>
            )}
            {(invoice.status === "posted" || invoice.status === "partial") && (
              <CanCreate permission="create_sales_payments">
                <Button href={`/penjualan/pembayaran/tambah/faktur/${invoice.slug ?? invoice.id}`} variant="primary" className="bg-success text-success-foreground">
                  Terima Pembayaran
                </Button>
              </CanCreate>
            )}
            {(invoice.status === "posted" || invoice.status === "partial" || invoice.status === "paid") &&
              invoice.salesOrder &&
              (DELIVERABLE_ORDER_STATUSES as readonly string[]).includes(invoice.salesOrder.status) && (
              <CanCreate permission="create_delivery_orders">
                <Button href={`/penjualan/surat-jalan/tambah/faktur/${invoice.slug ?? invoice.id}`} variant="primary">+ Surat Jalan</Button>
              </CanCreate>
            )}
            <WhatsappButton
              phone={invoice.customer.phone}
              modelType="SalesInvoice"
              modelId={invoice.id}
              surface="detail"
              message={buildWhatsappMessage({
                customerName: invoice.customer.name,
                documentLabel: "Faktur",
                documentNo: salesInvoiceLabel(invoice),
                status: invoice.status,
              })}
            />
            <PrintButton documentType="invoice" documentId={invoice.id} />
            {["draft", "approved"].includes(invoice.status) && (
              <ProcessButton
                id={invoice.id}
                action={postInvoice}
                label="Posting"
                confirmTitle="Posting faktur ini?"
                confirmBody="Faktur akan diposting: piutang diakui di jurnal dan stok barang berkurang sesuai barang pada faktur. Pastikan data sudah benar."
                successMessage="Faktur berhasil diposting"
              />
            )}
            {invoice.status !== "draft" && invoice.status !== "cancelled" && (
              <VoidButton
                id={invoice.id}
                action={voidSalesInvoice}
                requireReason
                title={`Batalkan faktur ${salesInvoiceLabel(invoice)}?`}
                body="Faktur ditandai dibatalkan dan seluruh dampak jurnal serta stoknya dibalik. Bila faktur masih punya pembayaran aktif, batalkan dulu tiap pembayaran lewat jalur reversal beralasan, baru batalkan faktur ini."
              />
            )}
            {/* BR-F139-03: hapus fisik hanya untuk draf. Tombol hapus
                disembunyikan untuk non-draf agar operator tidak mencoba
                aksi yang pasti ditolak server (penolakan tetap di server). */}
            {invoice.status === "draft" && (
              <CanCreate permission="delete_sales_invoices">
                <DeleteButton id={invoice.id} action={deleteSalesInvoice} />
              </CanCreate>
            )}
            <BackButton href="/penjualan/faktur" />
          </>
        }
      />

      <WhatsappTrailNote trail={whatsappTrail} />

      {/* GL-BR-003 K2: faktur terkunci (cancelled/setelah-pelunasan-nyata)
          — arahkan ke jalur koreksi sah (Retur, Batalkan di header). */}
      {!itemsEditable && (
        <LockedDocNotice
          kind="faktur"
          documentNo={invoice.documentNo}
          correctionHref={`/penjualan/retur/tambah/faktur/${invoice.slug ?? invoice.id}`}
        />
      )}

      <DetailTabs
        ariaLabel="Tab detail faktur"
        tabs={[
          {
            id: "info",
            label: "Info",
            content: (
              <>
                {/* Sengaja tanpa <StatusActions> generik (Setujui/Tolak): pada
                    faktur, tombol itu hanya membalik status ke approved tanpa
                    efek domain apa pun, sementara Posting di header sudah
                    menerima draft langsung — dua aksi maju yang tumpang tindih
                    membingungkan operator. Status cukup tampil sebagai chip
                    di header. */}
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

                {/* F-2026-10-25-036-S: snapshot tarif komisi beku di faktur.
                    Nilai verbatim dari kolom snapshot server — UI tidak
                    menghitung tarif/komisi/DPP dan tidak membaca tarif
                    kategori berjalan, jadi ubahan kategori sesudah faktur
                    lunas tidak mengubah tampilan faktur lama (AC-KT-F3). */}
                <DetailCard title="Snapshot Tarif Komisi">
                  {invoice.commissionRatePercent !== null &&
                  invoice.commissionRatePercent !== undefined ? (
                    <>
                      <DetailField
                        label="Tarif Komisi Snapshot (%)"
                        value={formatPercentage(Number(invoice.commissionRatePercent), 2)}
                      />
                      <DetailField
                        label="Kategori Pelanggan Snapshot"
                        value={invoice.commissionCustomerCategory?.name || "—"}
                      />
                      <DetailField
                        label="Status Snapshot"
                        value="Snapshot tarif beku saat faktur lunas — perubahan tarif kategori sesudahnya tidak mengubah faktur ini."
                        colSpan="full"
                      />
                    </>
                  ) : (
                    <DetailField
                      label="Status Snapshot"
                      value="Faktur ini belum memiliki snapshot tarif komisi tercatat."
                      colSpan="full"
                    />
                  )}
                </DetailCard>
              </>
            ),
          },
          {
            id: "items",
            label: "Barang",
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
                  description: item.description || `Barang #${item.itemId}`,
                  qty: Number(item.qty),
                  unitPrice: Number(item.unitPrice),
                  discount: Number(item.discount ?? 0),
                  total: Number(item.total),
                  uom: item.uom ?? null,
                  priceSource: item.priceSource ?? null,
                  priceListMinQty: item.priceListMinQty != null ? Number(item.priceListMinQty) : null,
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
                  isScrapSaleItem: i.isScrapSaleItem,
                  uomConversions: i.uomConversions.map((c) => ({ code: c.code, factorToBase: Number(c.factorToBase) })),
                }))}
                paidAmount={Number(invoice.paidAmount ?? 0)}
                editable={itemsEditable}
              />
            ),
          },
          {
            id: "down-payment",
            label: "Uang Muka",
            content: (
              <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-4 p-4 px-5 border-b border-default">
                  <h2 className="text-[0.9375rem] font-semibold text-foreground">Riwayat Uang Muka</h2>
                </div>
                <div className="p-4 px-5">
                  {(!invoice.quotation?.downPayments || invoice.quotation.downPayments.length === 0) ? (
                    <EmptyState title="Tidak ada uang muka" />
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
                            <DetailTableTd colSpan={4} align="right" className="font-bold">Total Uang Muka</DetailTableTd>
                            <DetailTableTd align="right" className="font-bold">{formatCurrency(invoice.quotation.downPayments.reduce((sum: number, dp: any) => sum + Number(dp.amount), 0))}</DetailTableTd>
                          </DetailTableFootRow>
                          <DetailTableFootRow>
                            <DetailTableTd colSpan={4} align="right">Total Keseluruhan Faktur</DetailTableTd>
                            <DetailTableTd align="right">{formatCurrency(Number(invoice.grandTotal))}</DetailTableTd>
                          </DetailTableFootRow>
                          <DetailTableFootRow>
                            <DetailTableTd colSpan={4} align="right" className="text-danger font-bold">Sisa Setelah Uang Muka</DetailTableTd>
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
                <div className="flex flex-wrap items-center justify-between gap-4 p-4 px-5 border-b border-default">
                  <h2 className="text-[0.9375rem] font-semibold text-foreground">Riwayat Pembayaran</h2>
                  {(invoice.status === "posted" || invoice.status === "partial") && (
                    <CanCreate permission="create_sales_payments">
                      <Link href={`/penjualan/pembayaran/tambah/faktur/${invoice.slug ?? invoice.id}`} className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border border-default transition-all hover:bg-surface-secondary">+ Terima Bayar</Link>
                    </CanCreate>
                  )}
                </div>
                <div className="p-4 px-5">
                  {invoice.payments.length === 0 ? (
                    <EmptyState title="Belum ada pembayaran" />
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
            id: "retur",
            label: "Retur",
            content: (
              <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-3 p-4 px-5 border-b border-default">
                  <h2 className="text-[0.9375rem] font-semibold text-foreground">Retur Penjualan</h2>
                  {(invoice.status === "posted" || invoice.status === "partial" || invoice.status === "paid") && (
                    <CanCreate permission="create_sales_returns">
                      <Link href={`/penjualan/retur/tambah/faktur/${invoice.slug ?? invoice.id}`} className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border border-default transition-all hover:bg-surface-secondary">+ Buat Retur</Link>
                    </CanCreate>
                  )}
                </div>
                <div className="p-4 px-5">
                  {invoice.salesReturns.length === 0 ? (
                    <EmptyState title="Belum ada retur untuk faktur ini" />
                  ) : (
                    <DetailTable>
                      <DetailTableHead>
                        <DetailTableTh>No. Dokumen</DetailTableTh>
                        <DetailTableTh>Tanggal</DetailTableTh>
                        <DetailTableTh>Status</DetailTableTh>
                      </DetailTableHead>
                      <DetailTableBody>
                        {invoice.salesReturns.map((r) => (
                          <DetailTableRow key={r.id}>
                            <DetailTableTd className="font-mono">
                              <Link href={entityHref("/penjualan/retur", r)}>{r.documentNo}</Link>
                            </DetailTableTd>
                            <DetailTableTd>{formatDate(r.date)}</DetailTableTd>
                            <DetailTableTd>
                              <StatusChip status={r.status} />
                            </DetailTableTd>
                          </DetailTableRow>
                        ))}
                      </DetailTableBody>
                    </DetailTable>
                  )}
                </div>
              </div>
            ),
          },
          ...(lateFeeBundle
            ? [
                {
                  id: "denda",
                  label: "Denda",
                  content: (
                    <SalesLateFeePanel
                      panel={lateFeeBundle.panel}
                      accounts={lateFeeBundle.accounts}
                      paymentMethods={lateFeeBundle.paymentMethods}
                      canCreate={canCreateLateFee}
                      canReverse={canReverseLateFee}
                    />
                  ),
                },
              ]
            : []),
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
