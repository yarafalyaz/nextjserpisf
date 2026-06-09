export const dynamic = "force-dynamic"

import { requirePermission } from "@/lib/auth/permissions"
import { ShippingMethodForm } from "@/components/forms/shipping-method-form"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { peekNextDocumentNumber } from "@/lib/utils/document-number"
import { getSystemSettings } from "@/lib/utils/settings"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Tambah Metode Pengiriman" }

export default async function CreateShippingMethodPage() {
  await requirePermission("create_shipping_methods")

  const generatedCode = await peekNextDocumentNumber("MTK", "simple")
  const settings = await getSystemSettings()
  const enableAutoCode = settings.enableAutoShippingMethodCode !== false

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
        { label: "Dasbor", href: "/" },
        { label: "Master Data", href: "/master" },
        { label: "Metode Pengiriman", href: "/master/metode-pengiriman" },
        { label: "Buat" },
      ]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Tambah Metode Pengiriman</h1>
      </div>
      <ShippingMethodForm generatedCode={generatedCode} enableAutoCode={enableAutoCode} />
    </div>
  )
}
