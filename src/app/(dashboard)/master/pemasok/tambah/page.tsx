export const dynamic = "force-dynamic"

import { requirePermission } from "@/lib/auth/permissions"
import { VendorForm } from "@/components/forms/vendor-form"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { peekNextDocumentNumber } from "@/lib/utils/document-number"
import { prisma } from "@/lib/db/prisma"

export default async function CreateVendorPage() {
  await requirePermission("create_vendors")

  const generatedCode = await peekNextDocumentNumber("VND", "simple")
  const paymentTerms = await prisma.paymentTerm.findMany({
    where: { isActive: true },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  })

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dashboard", href: "/" },
  { label: "Master Data", href: "/master" },
  { label: "Vendors", href: "/master/pemasok" },
  { label: "Create" },
]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Tambah Vendor</h1>
      </div>
      <VendorForm generatedCode={generatedCode} paymentTerms={paymentTerms} />
    </div>
  )
}
