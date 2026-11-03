export const dynamic = "force-dynamic"

import { loadPostableAccounts } from "@/lib/finance/postable-accounts"
import { requirePermission } from "@/lib/auth/permissions"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { BankTransferForm } from "../_components/bank-transfer-form"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Tambah Transfer Bank" }

export default async function CreateBankTransferPage() {
  await requirePermission("create_bank_transfers")

  const [accounts, expenseAccounts] = await Promise.all([
    // Rekening kas/bank = akun dengan reportGroup BANK (lihat COA standar).
    loadPostableAccounts({ reportGroup: "BANK" }),
    loadPostableAccounts({ type: "EXPENSE" }),
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
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">Tambah Transfer Bank</h1>
      </div>
      <BankTransferForm accounts={accounts} expenseAccounts={expenseAccounts} />
    </div>
  )
}
