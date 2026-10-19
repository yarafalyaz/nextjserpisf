export const dynamic = "force-dynamic"

import { requirePermission } from "@/lib/auth/permissions"
import { QuotationForm } from "@/components/forms/quotation-form"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { peekNextDocumentNumber } from "@/lib/utils/document-number"
import { loadQuotationFormOptions } from "../_components/quotation-options"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Tambah Penawaran" }

export default async function CreateQuotationPage() {
  await requirePermission("create_quotations")

  const [{ customers, vehicles, itemsList, paymentMethods, shippingMethods, products, unitOptions }, generatedCode] =
    await Promise.all([loadQuotationFormOptions(), peekNextDocumentNumber("QUO")])

  // Transform items to plain numbers (Decimal -> number)
  const items = itemsList.map((item) => ({
    id: item.id,
    name: item.name,
    price: Number(item.price),
    unitOfMeasure: item.unitOfMeasure,
  }))

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dasbor", href: "/" },
  { label: "Penjualan", href: "/penjualan" },
  { label: "Penawaran", href: "/penjualan/penawaran" },
  { label: "Tambah" },
]} />
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">Buat Penawaran</h1>
      </div>
      <QuotationForm
        customers={customers}
        customerVehicles={vehicles}
        items={items}
        products={products}
        unitOptions={unitOptions}
        generatedCode={generatedCode}
        paymentMethods={paymentMethods}
        shippingMethods={shippingMethods}
      />
    </div>
  )
}
