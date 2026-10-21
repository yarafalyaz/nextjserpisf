export const dynamic = "force-dynamic"

import type { Metadata } from "next"

import { prisma } from "@/lib/db/prisma"
import { requirePermission, hasPermission } from "@/lib/auth/permissions"

/**
 * Izin bupot dari F-034 (PR #301, belum di main saat file ini ditulis).
 * ponytail: literal + cast lokal supaya tsc main bersih; sesudah #301 merged
 * ganti dengan "manage_withholding_certificates" polos dan hapus cast ini.
 */
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import {
  WithholdingCertificateForm,
  WithholdingLifecycleActions,
  type TaxOption,
} from "@/app/(dashboard)/keuangan/dokumen-pajak/_components/withholding-certificate-form"
import { formatCurrency } from "@/lib/utils/format"

export const metadata: Metadata = { title: "Terbitkan Bukti Potong" }

/**
 * Terbit bukti potong (F-2026-10-21-003, tahap frontend).
 *
 * Izin terbit/cabut bupot = `manage_withholding_certificates`, izin setor
 * tetap `create_tax_payments` (F-034, PR #301); action server menegakkan
 * izin yang sama persis. Loader di sini murni opsi pilih — tarif dan jumlah
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
        select: { id: true, documentNo: true, grandTotal: true, vendor: { select: { name: true } } },
      }),
      prisma.salesPayment.findMany({
        orderBy: { paymentDate: "desc" },
        take: 100,
        select: { id: true, documentNo: true, amount: true },
      }),
      prisma.withholdingCertificate.findMany({
        where: { status: "issued" },
        orderBy: { withholdingDate: "desc" },
        take: 100,
        select: { id: true, certificateNumber: true, counterpartyName: true, withheldAmount: true },
      }),
      prisma.account.findMany({
        where: { isActive: true, type: "LIABILITY" },
        orderBy: { code: "asc" },
        select: { id: true, code: true, name: true },
      }),
      prisma.account.findMany({
        where: { isActive: true, reportGroup: "BANK" },
        orderBy: { code: "asc" },
        select: { id: true, code: true, name: true },
      }),
      hasPermission("create_tax_payments"),
    ])

  const typeOptions: TaxOption[] = withholdingTypes.map((t) => ({
    value: String(t.id),
    label: `${t.code} — ${t.name}`,
  }))
  const accountOption = (a: { id: number; code: string; name: string }): TaxOption => ({
    value: String(a.id),
    label: `${a.code} - ${a.name}`,
  })

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs
        items={[
          { label: "Dasbor", href: "/" },
          { label: "Keuangan", href: "/keuangan" },
          { label: "Dokumen Pajak", href: "/keuangan/dokumen-pajak/faktur/tambah" },
          { label: "Bukti Potong" },
        ]}
      />
      <h1 className="text-2xl font-bold text-foreground">Terbitkan Bukti Potong</h1>
      <WithholdingCertificateForm
        withholdingTypes={typeOptions}
        vendorBills={vendorBills.map((bill) => ({
          value: String(bill.id),
          label: `${bill.documentNo} — ${bill.vendor.name} (${formatCurrency(Number(bill.grandTotal))})`,
        }))}
        salesPayments={salesPayments.map((pay) => ({
          value: String(pay.id),
          label: `${pay.documentNo ?? `Pembayaran #${pay.id}`} — ${formatCurrency(Number(pay.amount))}`,
        }))}
      />
      <WithholdingLifecycleActions
        certificates={certificates.map((cert) => ({
          value: String(cert.id),
          label: `${cert.certificateNumber} — ${cert.counterpartyName} (${formatCurrency(Number(cert.withheldAmount))})`,
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
