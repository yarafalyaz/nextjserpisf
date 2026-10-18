export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { BankReconciliationForm } from "./form"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Tambah Rekonsiliasi Bank" }

export default async function CreateBankReconciliationPage() {
  await requirePermission("manage_bank_reconciliation")

  const accounts = await prisma.account.findMany({
    where: { isActive: true, type: "ASSET" },
    orderBy: { code: "asc" },
    select: { id: true, code: true, name: true },
  })

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs
        items={[
          { label: "Dasbor", href: "/" },
          { label: "Keuangan", href: "/keuangan" },
          { label: "Rekonsiliasi Bank", href: "/keuangan/rekonsiliasi-bank" },
          { label: "Buat" },
        ]}
      />
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">Buat Rekonsiliasi Bank</h1>
      </div>
      <BankReconciliationForm accounts={accounts} />
    </div>
  )
}
