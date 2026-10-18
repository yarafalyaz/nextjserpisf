export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { AccountForm } from "@/components/forms/account-form"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { peekNextDocumentNumber } from "@/lib/utils/document-number"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Tambah Akun" }

export default async function CreateAccountPage() {
  await requirePermission("create_accounts")

  const [accounts, generatedCode] = await Promise.all([
    prisma.account.findMany({
      where: { isActive: true },
      orderBy: { code: "asc" },
      select: { id: true, code: true, name: true },
    }),
    peekNextDocumentNumber("ACC", "simple"),
  ])

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dasbor", href: "/" },
  { label: "Data Master", href: "/master" },
  { label: "Akun (COA)", href: "/master/akun" },
  { label: "Buat" },
]} />
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">Tambah Akun</h1>
      </div>
      <AccountForm accounts={accounts} generatedCode={generatedCode} />
    </div>
  )
}
