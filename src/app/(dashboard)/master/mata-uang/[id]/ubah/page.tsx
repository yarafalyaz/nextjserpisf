export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { notFound } from "next/navigation"
import { CurrencyEditForm } from "./form"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

import type { Metadata } from "next"

import { requirePermission } from "@/lib/auth/permissions"
export const metadata: Metadata = { title: "Ubah Mata Uang" }

export default async function EditCurrencyPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requirePermission("edit_currencies")

  const { id } = await params
  const currency = await prisma.currency.findUnique({ where: { id: Number(id) } })

  if (!currency) notFound()

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dasbor", href: "/" },
  { label: "Master Data", href: "/master" },
  { label: "Mata Uang", href: "/master/mata-uang" },
  { label: "Ubah" },
]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Ubah Mata Uang: {currency.name}</h1>
      </div>
      <CurrencyEditForm currency={{ id: currency.id, code: currency.code, name: currency.name, rate: Number(currency.rate) }} />
    </div>
  )
}
