export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { formatCurrency, formatDate } from "@/lib/utils/format"
import Link from "next/link"
import { notFound } from "next/navigation"
import { DeleteButton } from "@/components/ui/delete-button"
import { deleteVendorBill, voidVendorBill, setVendorBillTaxInvoiceNumber } from "@/actions/purchase.actions"
import { VoidButton } from "@/components/ui/void-button"
import { PrintButton } from "@/components/ui/print-button"
import { TaxInvoiceNumberButton } from "@/components/ui/tax-invoice-number-button"
import { isValidVendorTaxInvoiceNumber } from "@/lib/tax/tax-invoice"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/shadcn/alert"
import { ReceiptText } from "lucide-react"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { TransactionAttachments } from "@/components/ui/transaction-attachments"
import { DetailTable, DetailTableHead, DetailTableTh, DetailTableBody, DetailTableRow, DetailTableTd } from "@/components/ui/detail-table"

import type { Metadata } from "next"

import { requirePermission, hasPermission } from "@/lib/auth/permissions"
import { resolveEntity } from "@/lib/utils/resolve-entity"
import { entityHref, entityEditHref } from "@/lib/utils/entity-url"
import { statusLabel } from "@/lib/utils/status-labels"
import { ProcessButton } from "@/components/ui/process-button"
import { confirmVendorBill } from "@/actions/purchase.actions"
import { CanCreate } from "@/components/auth/can-create"
export const metadata: Metadata = { title: "Tagihan" }

export default async function VendorBillDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  await requirePermission("view_vendor_bills")

  const { slug } = await params

  const bill = await resolveEntity(
    { segment: slug, fallbackWhere: {} },
    {
      bySlug: (s, where) =>
        prisma.vendorBill.findFirst({
          where: { slug: s, ...where },
          include: {
            vendor: true,
            purchaseOrder: true,
            goodsReceipt: { select: { id: true, slug: true, documentNo: true } },
            items: true,
          },
        }),
      byId: (id, where) =>
        prisma.vendorBill.findUnique({
          where: { id, ...where },
          include: {
            vendor: true,
            purchaseOrder: true,
            goodsReceipt: { select: { id: true, slug: true, documentNo: true } },
            items: true,
          },
        }),
    },
  )

  if (!bill) notFound()

  // F-2026-10-28-157-V Putusan 2: banner + tombol isi-nomor hanya bila
  // posted-ish, ber-PPN, dan belum bernomor valid. Server tetap fail-closed.
  const needsTaxInvoiceNumber =
    bill.status !== "draft" &&
    bill.status !== "cancelled" &&
    Number(bill.tax ?? 0) > 0 &&
    !isValidVendorTaxInvoiceNumber(bill.taxInvoiceNumber ?? null)
  const canSetTaxInvoiceNumber = await hasPermission("approve_vendor_bills")

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[{label:"Dasbor",href:"/"},{label:"Pembelian",href:"/pembelian"},{ label: "Tagihan Pemasok", href: "/pembelian/tagihan" },{label:"Detail"}]} />
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">Tagihan {bill.documentNo}</h1>
        <div className="flex gap-2 items-center">
          <span className={`status-badge status-${bill.status}`}>{statusLabel(bill.status)}</span>
          <div className="flex gap-2">
            {bill.status === "draft" && (
              <ProcessButton
                id={bill.id}
                action={confirmVendorBill}
                label="Konfirmasi"
                confirmTitle="Konfirmasi tagihan ini?"
                confirmBody="Tagihan akan diposting: utang diakui di jurnal. Pastikan data sudah benar."
                successMessage="Tagihan berhasil dikonfirmasi"
              />
            )}
            {bill.status !== "draft" && bill.status !== "cancelled" && bill.status !== "paid" && Number(bill.balanceDue) > 0 && (
            <CanCreate permission="create_vendor_payments">
              <Link href={`/pembelian/pembayaran-vendor/tambah/tagihan/${bill.slug ?? bill.id}`} className="inline-flex items-center justify-center gap-1.5 w-full sm:w-auto px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all">Bayar</Link>
            </CanCreate>
          )}
          <CanCreate permission="edit_vendor_bills">
            <Link href={entityEditHref("/pembelian/tagihan", bill)} className="inline-flex items-center justify-center gap-1.5 w-full sm:w-auto px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all">Ubah</Link>
          </CanCreate>
          {needsTaxInvoiceNumber && canSetTaxInvoiceNumber && (
            <TaxInvoiceNumberButton id={bill.id} action={setVendorBillTaxInvoiceNumber} />
          )}
          <PrintButton documentType="vendor-bill" documentId={bill.id} />
          {bill.status !== "draft" && bill.status !== "cancelled" && (
            <VoidButton id={bill.id} action={voidVendorBill} />
          )}
          <CanCreate permission="delete_vendor_bills">
            <DeleteButton id={bill.id} action={deleteVendorBill} />
          </CanCreate>
                  <Link href="/pembelian/tagihan" className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:bg-surface-secondary hover:text-foreground transition-all">← Kembali</Link>
        </div>
        </div>
      </div>

      {/* F-2026-10-28-157-V: PPN gabung HPP bila belum bernomor — notice
          server verbatim, tanpa hitung ulang di UI. */}
      {needsTaxInvoiceNumber && (
        <Alert variant="warning" role="alert">
          <ReceiptText aria-hidden="true" />
          <AlertTitle>PPN digabung ke HPP</AlertTitle>
          <AlertDescription>
            Nomor faktur pajak belum diisi — PPN digabung ke harga perolehan/HPP dan belum bisa dikreditkan. Lengkapi lewat aksi isi-nomor-faktur.
          </AlertDescription>
        </Alert>
      )}

      {/* Sengaja tanpa <StatusActions> generik (Setujui/Tolak): pada tagihan,
          tombol itu hanya membalik status ke approved tanpa jurnal dan
          tanpa balanceDue, sementara Konfirmasi di header memposting dari
          draft langsung. Sesudah "disetujui" generik, Konfirmasi hilang
          (draft-only) dan Bayar terkunci (balanceDue masih 0) — tagihan
          terkunci permanen. Status cukup tampil sebagai badge di header. */}
      <div className="bg-surface rounded-xl border border-default shadow-sm p-4 sm:p-6">
        <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">No. Dokumen</span>
            <span className="text-[0.9375rem] text-foreground font-medium font-mono">{bill.documentNo}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Vendor</span>
            <span className="text-[0.9375rem] text-foreground font-medium">
              <Link href={entityHref("/master/vendor", bill.vendor)}>{bill.vendor.name}</Link>
            </span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Pesanan Pembelian</span>
            <span className="text-[0.9375rem] text-foreground font-medium">
              {bill.purchaseOrder ? (
                <span className="inline-flex items-center gap-2">
                  <Link href={entityHref("/pembelian/pesanan", bill.purchaseOrder)}>{bill.purchaseOrder.documentNo}</Link>
                  {bill.purchaseOrder.isService && (
                    <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[0.6875rem] font-medium text-primary">
                      Tagihan Jasa
                    </span>
                  )}
                </span>
              ) : "-"}
            </span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Penerimaan Barang</span>
            <span className="text-[0.9375rem] text-foreground font-medium">
              {bill.goodsReceipt ? (
                <Link href={entityHref("/pembelian/penerimaan", bill.goodsReceipt)}>{bill.goodsReceipt.documentNo}</Link>
              ) : "-"}
            </span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Tanggal</span>
            <span className="text-[0.9375rem] text-foreground font-medium">{formatDate(bill.date)}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Jatuh Tempo</span>
            <span className="text-[0.9375rem] text-foreground font-medium">{bill.dueDate ? formatDate(bill.dueDate) : "-"}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">No. Faktur Pajak</span>
            <span className="text-[0.9375rem] text-foreground font-medium">{bill.taxInvoiceNumber?.trim() ? bill.taxInvoiceNumber : <span className="text-muted-foreground">Belum ada nomor faktur tercatat</span>}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Syarat Pembayaran</span>
            <span className="text-[0.9375rem] text-foreground font-medium">{bill.terms?.trim() ? bill.terms : <span className="text-muted-foreground">Termin tunggal</span>}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Total Keseluruhan</span>
            <span className="text-xl text-foreground font-medium">{formatCurrency(Number(bill.grandTotal))}</span>
          </div>
        </div>
      </div>

      {/* Items */}
      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-4 p-4 px-5 border-b border-default">
          <h2 className="text-[0.9375rem] font-semibold text-foreground">Item</h2>
        </div>
        <div className="p-4 px-5">
          <DetailTable>
            <DetailTableHead>
              <DetailTableTh>Deskripsi</DetailTableTh>
              <DetailTableTh align="right">Jml</DetailTableTh>
              <DetailTableTh align="right">Harga</DetailTableTh>
              <DetailTableTh align="right">Total</DetailTableTh>
            </DetailTableHead>
            <DetailTableBody>
              {bill.items.map((item) => (
                <DetailTableRow key={item.id}>
                  <DetailTableTd>{item.description || "-"}</DetailTableTd>
                  <DetailTableTd align="right">{Number(item.qty)}</DetailTableTd>
                  <DetailTableTd align="right">{formatCurrency(Number(item.unitPrice))}</DetailTableTd>
                  <DetailTableTd align="right">{formatCurrency(Number(item.total))}</DetailTableTd>
                </DetailTableRow>
              ))}
            </DetailTableBody>
          </DetailTable>
        </div>
      </div>

      {/* Summary */}
      <div className="bg-surface rounded-xl border border-default shadow-sm p-4 sm:p-6">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Subtotal</span>
            <span className="text-[0.9375rem] text-foreground font-medium">{formatCurrency(Number(bill.subtotal))}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Pajak</span>
            <span className="text-[0.9375rem] text-foreground font-medium">{formatCurrency(Number(bill.tax))}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Terbayar</span>
            <span className="text-[0.9375rem] text-foreground font-medium">{formatCurrency(Number(bill.paidAmount))}</span>
          </div>
        </div>
      </div>
      <TransactionAttachments referenceType="vendor_bill" referenceId={bill.id} />
    </div>
  )
}
