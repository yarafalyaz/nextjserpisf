export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { notFound } from "next/navigation"
import { TaxEditForm } from "./form"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

import type { Metadata } from "next"

import { requirePermission } from "@/lib/auth/permissions"
export const metadata: Metadata = { title: "Ubah Pajak" }

export default async function EditTaxPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requirePermission("edit_taxes")

  const { id } = await params
  const numId = Number(id)
  if (Number.isNaN(numId)) notFound()
  const tax = await prisma.tax.findUnique({ where: { id: numId } })

  if (!tax) notFound()

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dasbor", href: "/" },
  { label: "Master Data", href: "/master" },
  { label: "Pajak", href: "/master/pajak" },
  { label: "Ubah" },
]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Ubah Pajak: {tax.name}</h1>
      </div>
      <TaxEditForm tax={{ id: tax.id, name: tax.name, rate: Number(tax.rate) }} />
    </div>
  )
}
