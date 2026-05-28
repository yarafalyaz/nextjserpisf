export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { notFound } from "next/navigation"
import { CurrencyEditForm } from "./form"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

export default async function EditCurrencyPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const currency = await prisma.currency.findUnique({ where: { id: Number(id) } })

  if (!currency) notFound()

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dashboard", href: "/" },
  { label: "Master Data", href: "/master" },
  { label: "Currencies", href: "/master/currencies" },
  { label: "Edit" },
]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Edit Mata Uang: {currency.name}</h1>
      </div>
      <CurrencyEditForm currency={{ id: currency.id, code: currency.code, name: currency.name, rate: Number(currency.rate) }} />
    </div>
  )
}
