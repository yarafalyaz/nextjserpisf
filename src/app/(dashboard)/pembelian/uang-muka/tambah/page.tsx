export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { PurchaseAdvanceForm } from "../_components/purchase-advance-form"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Tambah Uang Muka Pembelian" }

export default async function CreatePurchaseAdvancePage() {
  await requirePermission("create_purchase_advances")

  const [vendors, paymentAccounts, assetAccounts] = await Promise.all([
    prisma.vendor.findMany({
      where: { isActive: true, deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    // Kas/bank = akun reportGroup BANK (lihat COA standar).
    prisma.account.findMany({
      where: { isActive: true, reportGroup: "BANK" },
      orderBy: { code: "asc" },
      select: { id: true, code: true, name: true },
    }),
    // Akun uang muka bisa ada di AREC (mis. "110302 Uang Muka Pembelian IDR")
    // maupun OCAS, jadi pilihannya seluruh akun aset — bukan disaring per kelompok,
    // supaya akun uang muka yang sah tidak ikut hilang dari daftar.
    prisma.account.findMany({
      where: { isActive: true, type: "ASSET" },
      orderBy: { code: "asc" },
      select: { id: true, code: true, name: true },
    }),
  ])

  const defaultAdvanceAccountId =
    assetAccounts.find((account) => /uang muka/i.test(account.name))?.id ?? null

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs
        items={[
          { label: "Dasbor", href: "/" },
          { label: "Pembelian", href: "/pembelian" },
          { label: "Uang Muka Pembelian", href: "/pembelian/uang-muka" },
          { label: "Buat" },
        ]}
      />
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-foreground">Tambah Uang Muka Pembelian</h1>
      </div>
      <PurchaseAdvanceForm
        vendors={vendors}
        paymentAccounts={paymentAccounts}
        assetAccounts={assetAccounts}
        defaultAdvanceAccountId={defaultAdvanceAccountId}
      />
    </div>
  )
}
