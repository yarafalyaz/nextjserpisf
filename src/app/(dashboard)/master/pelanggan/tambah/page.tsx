export const dynamic = "force-dynamic"

import { requirePermission } from "@/lib/auth/permissions"
import { CustomerForm } from "@/components/forms/customer-form"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { peekNextDocumentNumber } from "@/lib/utils/document-number"
import { getSystemSettings } from "@/lib/utils/settings"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Tambah Pelanggan" }

export default async function CreateCustomerPage() {
  await requirePermission("create_customers")

  const generatedCode = await peekNextDocumentNumber("CUST", "simple")
  const settings = await getSystemSettings()
  const enableAutoCode = settings.enableAutoCustomerCode !== false

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dasbor", href: "/" },
  { label: "Master Data", href: "/master" },
  { label: "Pelanggan", href: "/master/pelanggan" },
  { label: "Buat" },
]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Tambah Pelanggan</h1>
      </div>
      <CustomerForm generatedCode={generatedCode} enableAutoCode={enableAutoCode} />
    </div>
  )
}
