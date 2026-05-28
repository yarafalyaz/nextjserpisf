export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { QuotationForm } from "@/components/forms/quotation-form"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { peekNextDocumentNumber } from "@/lib/utils/document-number"

export default async function CreateQuotationPage() {
  await requirePermission("create_quotations")

  const [customers, customerVehicles, itemsList, generatedCode] = await Promise.all([
    prisma.customer.findMany({
      where: { isActive: true, deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.customerVehicle.findMany({
      include: {
        vehicle: {
          include: {
            variant: {
              include: {
                model: {
                  include: { brand: true },
                },
              },
            },
          },
        },
      },
    }),
    prisma.item.findMany({
      where: { isActive: true, deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true, price: true, unitOfMeasure: true },
    }),
    peekNextDocumentNumber("QUO"),
  ])

  // Transform customerVehicles to a simpler shape for the form
  const vehicles = customerVehicles.map((cv) => ({
    id: cv.id,
    customerId: cv.customerId,
    plateNumber: cv.vehicle?.plateNumber || "-",
    brandName: cv.vehicle?.variant?.model?.brand?.name || "",
    modelName: cv.vehicle?.variant?.model?.name || "",
  }))

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
  { label: "Dashboard", href: "/" },
  { label: "Sales", href: "/penjualan" },
  { label: "Quotations", href: "/penjualan/penawaran" },
  { label: "Create" },
]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Buat Quotation</h1>
      </div>
      <QuotationForm
        customers={customers}
        customerVehicles={vehicles}
        items={items}
        generatedCode={generatedCode}
      />
    </div>
  )
}
