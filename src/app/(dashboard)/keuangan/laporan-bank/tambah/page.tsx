export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { loadPostableAccounts } from "@/lib/finance/postable-accounts"
import { requirePermission } from "@/lib/auth/permissions"
import { PageHeader } from "@/components/ui/page-header"
import { BankStatementForm } from "./form"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Tambah Rekening Koran" }

export default async function CreateBankStatementPage() {
  // Izin tulis = penulis header rekening koran (`createBankStatement`).
  await requirePermission("create_journals")

  const [accounts, banks] = await Promise.all([
    loadPostableAccounts({ type: "ASSET", reportGroup: "BANK" }),
    prisma.bank.findMany({
      where: { isActive: true },
      orderBy: { code: "asc" },
      select: { id: true, code: true, name: true },
    }),
  ])

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Buat Rekening Koran"
        subtitle="Registrasi header dokumen rekening koran bank sebelum mengimpor atau menambahkan baris transaksi mutasi."
        breadcrumbs={[
          { label: "Dasbor", href: "/" },
          { label: "Keuangan", href: "/keuangan" },
          { label: "Rekening Koran", href: "/keuangan/laporan-bank" },
          { label: "Tambah Rekening Koran" },
        ]}
      />
      <BankStatementForm accounts={accounts} banks={banks} />
    </div>
  )
}
