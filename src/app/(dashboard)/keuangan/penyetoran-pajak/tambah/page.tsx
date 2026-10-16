export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { TaxPaymentForm } from "../_components/tax-payment-form"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Tambah Penyetoran Pajak" }

export default async function CreateTaxPaymentPage() {
  await requirePermission("create_tax_payments")

  const [taxTypes, liabilityAccounts, paymentAccounts] = await Promise.all([
    prisma.withholdingTaxType.findMany({
      where: { isActive: true, deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    // Akun utang pajak = akun kewajiban (mis. "210202 PPh 23 Pembelian").
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
  ])

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs
        items={[
          { label: "Dasbor", href: "/" },
          { label: "Keuangan", href: "/keuangan" },
          { label: "Penyetoran Pajak", href: "/keuangan/penyetoran-pajak" },
          { label: "Tambah" },
        ]}
      />
      <h1 className="text-2xl font-bold text-foreground">Tambah Penyetoran Pajak</h1>
      <TaxPaymentForm
        taxTypes={taxTypes.map((type) => ({ value: String(type.id), label: type.name }))}
        liabilityAccounts={liabilityAccounts.map((account) => ({
          value: String(account.id),
          label: `${account.code} - ${account.name}`,
        }))}
        paymentAccounts={paymentAccounts.map((account) => ({
          value: String(account.id),
          label: `${account.code} - ${account.name}`,
        }))}
      />
    </div>
  )
}
