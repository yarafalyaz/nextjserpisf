export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { notFound } from "next/navigation"
import { requirePermission } from "@/lib/auth/permissions"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { TaxGroupEditForm } from "./form"

export default async function EditTaxGroupPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requirePermission("edit_taxes")
  const { id } = await params

  const [group, taxes] = await Promise.all([
    prisma.taxGroup.findUnique({ where: { id: Number(id) }, include: { taxes: true } }),
    prisma.tax.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
  ])
  if (!group) notFound()

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
        { label: "Dasbor", href: "/" },
        { label: "Master Data", href: "/master" },
        { label: "Kelompok Pajak", href: "/master/kelompok-pajak" },
        { label: "Ubah" },
      ]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Ubah Grup Pajak</h1>
      </div>
      <TaxGroupEditForm
        id={group.id}
        name={group.name}
        selectedTaxIds={group.taxes.map((t) => t.taxId)}
        taxes={taxes.map((t) => ({ id: t.id, name: t.name, rate: Number(t.rate) }))}
      />
    </div>
  )
}
