export const dynamic = "force-dynamic"

import { requirePermission } from "@/lib/auth/permissions"
import { PaymentMethodForm } from "@/components/forms/payment-method-form"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { peekNextDocumentNumber } from "@/lib/utils/document-number"
import { getSystemSettings } from "@/lib/utils/settings"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Tambah Metode Pembayaran" }

export default async function CreatePaymentMethodPage() {
  await requirePermission("create_payment_methods")

  const generatedCode = await peekNextDocumentNumber("MTP", "simple")
  const settings = await getSystemSettings()
  const enableAutoCode = settings.enableAutoPaymentMethodCode !== false

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
        { label: "Dasbor", href: "/" },
        { label: "Master Data", href: "/master" },
        { label: "Metode Pembayaran", href: "/master/metode-pembayaran" },
        { label: "Buat" },
      ]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Tambah Metode Pembayaran</h1>
      </div>
      <PaymentMethodForm generatedCode={generatedCode} enableAutoCode={enableAutoCode} />
    </div>
  )
}
