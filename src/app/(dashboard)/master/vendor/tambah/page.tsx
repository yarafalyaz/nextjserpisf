export const dynamic = "force-dynamic"

import { requirePermission } from "@/lib/auth/permissions"
import { VendorForm } from "@/components/forms/vendor-form"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { peekNextDocumentNumber } from "@/lib/utils/document-number"
import { getSystemSettings } from "@/lib/utils/settings"
import { prisma } from "@/lib/db/prisma"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Tambah Pemasok" }

export default async function CreateVendorPage() {
  await requirePermission("create_vendors")

  const generatedCode = await peekNextDocumentNumber("VND", "simple")
  const paymentTerms = await prisma.paymentTerm.findMany({
    where: { isActive: true },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  })
  const settings = await getSystemSettings()
  const enableAutoCode = settings.enableAutoVendorCode !== false

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dasbor", href: "/" },
  { label: "Data Master", href: "/master" },
  { label: "Pemasok", href: "/master/vendor" },
  { label: "Buat" },
]} />
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">Tambah Pemasok</h1>
      </div>
      <VendorForm generatedCode={generatedCode} enableAutoCode={enableAutoCode} paymentTerms={paymentTerms} />
    </div>
  )
}
