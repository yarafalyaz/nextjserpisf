export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { JournalForm } from "@/components/forms/journal-form"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

export default async function CreateJournalPage() {
  await requirePermission("create_journals")

  const accounts = await prisma.account.findMany({
    where: { isActive: true },
    orderBy: { code: "asc" },
  })

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Buat Journal Entry</h1>
      </div>
      <JournalForm accounts={accounts} />
    </div>
  )
}
