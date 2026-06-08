export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { notFound } from "next/navigation"
import { EditBankForm } from "./form"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

export default async function EditBankPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const bank = await prisma.bank.findUnique({
    where: { id: Number(id) },
  })

  if (!bank) notFound()

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dasbor", href: "/" },
  { label: "Master Data", href: "/master" },
  { label: "Bank", href: "/master/bank" },
  { label: "Ubah" },
]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Ubah Bank: {bank.name}</h1>
      </div>
      <EditBankForm bank={bank} />
    </div>
  )
}
