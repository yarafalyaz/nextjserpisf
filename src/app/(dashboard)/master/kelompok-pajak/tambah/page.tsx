import { prisma } from "@/lib/db/prisma"
import { TaxGroupForm } from "./form"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

export const dynamic = "force-dynamic"

export default async function CreateTaxGroupPage() {
  const taxes = await prisma.tax.findMany({ where: { isActive: true }, orderBy: { name: "asc" } })

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dashboard", href: "/" },
  { label: "Master Data", href: "/master" },
  { label: "Tax Groups", href: "/master/kelompok-pajak" },
  { label: "Create" },
]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Tambah Grup Pajak</h1>
      </div>
      <TaxGroupForm taxes={taxes.map((t) => ({ id: t.id, name: t.name, rate: Number(t.rate) }))} />
    </div>
  )
}
