export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { BankStatementForm } from "./form"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Tambah Rekening Koran" }

export default async function CreateBankStatementPage() {
  // Izin tulis = penulis header rekening koran (`createBankStatement`).
  await requirePermission("create_journals")

  const [accounts, banks] = await Promise.all([
    prisma.account.findMany({
      where: { isActive: true, type: "ASSET" },
      orderBy: { code: "asc" },
      select: { id: true, code: true, name: true },
    }),
    prisma.bank.findMany({
      where: { isActive: true },
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
          { label: "Rekening Koran", href: "/keuangan/laporan-bank" },
          { label: "Buat" },
        ]}
      />
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">Buat Rekening Koran</h1>
      </div>
      <BankStatementForm accounts={accounts} banks={banks} />
    </div>
  )
}
