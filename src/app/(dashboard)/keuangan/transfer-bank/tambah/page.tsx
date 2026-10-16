export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { BankTransferForm } from "../_components/bank-transfer-form"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Tambah Transfer Bank" }

export default async function CreateBankTransferPage() {
  await requirePermission("create_bank_transfers")

  const [accounts, expenseAccounts] = await Promise.all([
    // Rekening kas/bank = akun dengan reportGroup BANK (lihat COA standar).
    prisma.account.findMany({
      where: { isActive: true, reportGroup: "BANK" },
      orderBy: { code: "asc" },
      select: { id: true, code: true, name: true },
    }),
    prisma.account.findMany({
      where: { isActive: true, type: "EXPENSE" },
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
          { label: "Transfer Bank", href: "/keuangan/transfer-bank" },
          { label: "Buat" },
        ]}
      />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Tambah Transfer Bank</h1>
      </div>
      <BankTransferForm accounts={accounts} expenseAccounts={expenseAccounts} />
    </div>
  )
}
