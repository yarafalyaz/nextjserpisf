import { prisma } from "@/lib/db/prisma"
import { TaxGroupForm } from "./form"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

import type { Metadata } from "next"

import { requirePermission } from "@/lib/auth/permissions"
export const metadata: Metadata = { title: "Tambah Kelompok Pajak" }

export const dynamic = "force-dynamic"

export default async function CreateTaxGroupPage() {
  await requirePermission("edit_tax_groups")

  const taxes = await prisma.tax.findMany({ where: { isActive: true }, orderBy: { name: "asc" } })

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dasbor", href: "/" },
  { label: "Master Data", href: "/master" },
  { label: "Kelompok Pajak", href: "/master/kelompok-pajak" },
  { label: "Buat" },
]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Tambah Grup Pajak</h1>
      </div>
      <TaxGroupForm taxes={taxes.map((t) => ({ id: t.id, name: t.name, rate: Number(t.rate) }))} />
    </div>
  )
}
