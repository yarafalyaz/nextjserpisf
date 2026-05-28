export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { notFound } from "next/navigation"
import { PettyCashForm } from "@/components/forms/petty-cash-form"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

export default async function EditPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const data = await prisma.pettyCash.findUnique({
    where: { id: Number(id) },
  })

  if (!data) notFound()

  const accounts = await prisma.account.findMany({ orderBy: { code: "asc" } })

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dashboard", href: "/" },
  { label: "finance", href: "/keuangan/kas-kecil" },
  { label: "Edit" },
]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Edit</h1>
      </div>
      <PettyCashForm pettyCash={data as any} accounts={accounts as any}/>
    </div>
  )
}
