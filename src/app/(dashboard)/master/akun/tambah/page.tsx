export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { AccountForm } from "@/components/forms/account-form"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { peekNextDocumentNumber } from "@/lib/utils/document-number"

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
  { label: "Dashboard", href: "/" },
  { label: "Master Data", href: "/master" },
  { label: "Accounts", href: "/master/accounts" },
  { label: "Create" },
]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Tambah Akun</h1>
      </div>
      <AccountForm accounts={accounts} generatedCode={generatedCode} />
    </div>
  )
}
