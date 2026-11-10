export const dynamic = "force-dynamic"

import type { Metadata } from "next"

import { prisma } from "@/lib/db/prisma"
import { loadPostableAccounts } from "@/lib/finance/postable-accounts"
import { requirePermission, hasPermission } from "@/lib/auth/permissions"
import { PageHeader } from "@/components/ui/page-header"
import {
  WithholdingCertificateForm,
  WithholdingLifecycleActions,
  type TaxOption,
  type ExtendedTaxOption,
} from "@/app/(dashboard)/keuangan/dokumen-pajak/_components/withholding-certificate-form"
import { formatCurrencyExact } from "@/lib/utils/format"

export const metadata: Metadata = { title: "Terbitkan Bukti Potong" }

/**
 * Terbit bukti potong (F-2026-10-21-003, tahap frontend).
 *
 * Izin terbit/cabut bupot = `manage_withholding_certificates`, izin setor
 * tetap `create_tax_payments` (F-034, PR #301); action server menegakkan
 * izin yang sama persis. Loader di sini murni opsi pilih: tarif dan jumlah
 * potong dibaca/dihitung service, bukan UI.
 */
export default async function CreateWithholdingCertificatePage() {
  await requirePermission("manage_withholding_certificates")

  const [withholdingTypes, vendorBills, salesPayments, certificates, liabilityAccounts, paymentAccounts, canSettle] =
    await Promise.all([
      prisma.withholdingTaxType.findMany({
        where: { isActive: true, deletedAt: null },
        orderBy: { name: "asc" },
        select: { id: true, code: true, name: true },
      }),
      prisma.vendorBill.findMany({
        where: { status: { in: ["posted", "partial", "paid"] }, deletedAt: null },
        orderBy: { date: "desc" },
        take: 100,
        select: {
          id: true,
          documentNo: true,
          subtotal: true,
          grandTotal: true,
          vendor: { select: { name: true, npwp: true } },
        },
      }),
      prisma.salesPayment.findMany({
        orderBy: { paymentDate: "desc" },
        take: 100,
        select: {
          id: true,
          documentNo: true,
          amount: true,
          salesInvoice: {
            select: {
              customer: { select: { name: true, taxId: true } },
            },
          },
        },
      }),
      prisma.withholdingCertificate.findMany({
        where: { status: "issued" },
        orderBy: { withholdingDate: "desc" },
        take: 100,
        select: { id: true, certificateNumber: true, counterpartyName: true, withheldAmount: true },
      }),
      loadPostableAccounts({ type: "LIABILITY" }),
      loadPostableAccounts({ reportGroup: "BANK" }),
      hasPermission("create_tax_payments"),
    ])

  const typeOptions: TaxOption[] = withholdingTypes.map((t) => ({
    value: String(t.id),
    label: `${t.code} - ${t.name}`,
  }))

  const billOptions: ExtendedTaxOption[] = vendorBills.map((bill) => ({
    value: String(bill.id),
    label: `${bill.documentNo} - ${bill.vendor.name} (${formatCurrencyExact(Number(bill.grandTotal))})`,
    counterpartyName: bill.vendor.name,
    counterpartyTaxId: bill.vendor.npwp ?? undefined,
    dpp: Number(bill.subtotal ?? bill.grandTotal),
  }))

  const paymentOptions: ExtendedTaxOption[] = salesPayments.map((pay) => ({
    value: String(pay.id),
    label: `${pay.documentNo ?? `Pembayaran #${pay.id}`} - ${pay.salesInvoice.customer.name} (${formatCurrencyExact(Number(pay.amount))})`,
    counterpartyName: pay.salesInvoice.customer.name,
    counterpartyTaxId: pay.salesInvoice.customer.taxId ?? undefined,
    dpp: Number(pay.amount),
  }))

  const accountOption = (a: { id: number; code: string; name: string }): TaxOption => ({
    value: String(a.id),
    label: `${a.code} - ${a.name}`,
  })

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Terbitkan Bukti Potong"
        subtitle="Pembuatan dokumen bukti pemotongan PPh Unifikasi (PPh 21/22/23/4(2)/15/26) atas pembayaran komersial."
        breadcrumbs={[
          { label: "Dasbor", href: "/" },
          { label: "Keuangan", href: "/keuangan" },
          { label: "Dokumen Pajak", href: "/keuangan/dokumen-pajak/faktur" },
          { label: "Bukti Potong", href: "/keuangan/dokumen-pajak/bupot" },
          { label: "Terbitkan Bukti Potong" },
        ]}
      />
      <WithholdingCertificateForm
        withholdingTypes={typeOptions}
        vendorBills={billOptions}
        salesPayments={paymentOptions}
      />
      <WithholdingLifecycleActions
        certificates={certificates.map((cert) => ({
          value: String(cert.id),
          label: `${cert.certificateNumber} - ${cert.counterpartyName} (${formatCurrencyExact(Number(cert.withheldAmount))})`,
        }))}
        withholdingTypes={typeOptions}
        liabilityAccounts={liabilityAccounts.map(accountOption)}
        paymentAccounts={paymentAccounts.map(accountOption)}
        canRevoke
        canSettle={canSettle}
      />
    </div>
  )
}
