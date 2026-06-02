export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { notFound } from "next/navigation"
import { AccountForm } from "@/components/forms/account-form"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

export default async function EditAccountPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const data = await prisma.account.findUnique({
    where: { id: Number(id) },
  })

  if (!data) notFound()

  const parentAccounts = await prisma.account.findMany({ where: { parentId: null }, orderBy: { code: "asc" }, select: { id: true, code: true, name: true } })

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dashboard", href: "/" },
  { label: "Master Data", href: "/master/akun" },
  { label: "Akun", href: "/master/akun" },
  { label: "Edit" },
]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Edit Akun</h1>
      </div>
      <AccountForm account={{ id: data.id, code: data.code, name: data.name, type: data.type, parentId: data.parentId, description: data.description }} accounts={parentAccounts} />
    </div>
  )
}
