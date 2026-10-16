export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { WithholdingTaxTypeForm } from "@/components/forms/withholding-tax-type-form"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Tambah Jenis PPh" }

export default async function CreateWithholdingTaxTypePage() {
  await requirePermission("manage_withholding_tax")

  const accounts = await prisma.account.findMany({
    where: { isActive: true },
    orderBy: { code: "asc" },
    select: { id: true, code: true, name: true },
  })

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
        { label: "Dasbor", href: "/" },
        { label: "Pengaturan", href: "/pengaturan" },
        { label: "Jenis PPh", href: "/pengaturan/pajak-potong" },
        { label: "Tambah" },
      ]} />
      <h1 className="text-2xl font-bold text-foreground">Tambah Jenis Pemotongan PPh</h1>
      <WithholdingTaxTypeForm accounts={accounts} />
    </div>
  )
}
