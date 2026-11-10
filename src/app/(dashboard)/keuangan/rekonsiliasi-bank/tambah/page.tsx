export const dynamic = "force-dynamic"

import { loadPostableAccounts } from "@/lib/finance/postable-accounts"
import { requirePermission } from "@/lib/auth/permissions"
import { PageHeader } from "@/components/ui/page-header"
import { BankReconciliationForm } from "./form"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Tambah Rekonsiliasi Bank" }

export default async function CreateBankReconciliationPage() {
  await requirePermission("manage_bank_reconciliation")

  const accounts = await loadPostableAccounts({ type: "ASSET", reportGroup: "BANK" })

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Buat Rekonsiliasi Bank"
        subtitle="Inisiasi sesi rekonsiliasi untuk mencocokkan mutasi rekening koran fisik bank dengan buku besar kas/bank perusahaan."
        breadcrumbs={[
          { label: "Dasbor", href: "/" },
          { label: "Keuangan", href: "/keuangan" },
          { label: "Rekonsiliasi Bank", href: "/keuangan/rekonsiliasi-bank" },
          { label: "Buat Rekonsiliasi" },
        ]}
      />
      <BankReconciliationForm accounts={accounts} />
    </div>
  )
}
