export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { QuotationForm } from "@/components/forms/quotation-form"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { peekNextDocumentNumber } from "@/lib/utils/document-number"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Tambah Penawaran" }

export default async function CreateQuotationPage() {
  await requirePermission("create_quotations")

  const [customers, customerVehicles, itemsList, generatedCode, paymentMethods, shippingMethods, productsList] = await Promise.all([
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
    prisma.paymentMethod.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { code: true, name: true } }),
    prisma.shippingMethod.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { code: true, name: true } }),
    prisma.product.findMany({
      orderBy: { name: "asc" },
      include: { materials: true },
    }),
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

  // Map items to lookup map for product materials
  const itemsMap = new Map(itemsList.map((item) => [item.id, item]))

  // Map products to include item info in materials
  const products = productsList.map((p) => {
    const totalPrice = p.materials.reduce((sum, m) => {
      const item = itemsMap.get(m.itemId)
      return sum + (item ? Number(m.qty) * Number(item.price) : 0)
    }, 0)

    return {
      id: p.id,
      code: p.code,
      name: p.name,
      standardCost: totalPrice > 0 ? totalPrice : Number(p.standardCost),
      materials: p.materials.map((m) => {
        const item = itemsMap.get(m.itemId)
        return {
          itemId: m.itemId,
          qty: Number(m.qty),
          name: item?.name || "Unknown Item",
          price: item ? Number(item.price) : 0,
          unitOfMeasure: item?.unitOfMeasure || "PCS",
        }
      }),
    }
  })

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dasbor", href: "/" },
  { label: "Penjualan", href: "/penjualan" },
  { label: "Penawaran", href: "/penjualan/penawaran" },
  { label: "Tambah" },
]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Buat Penawaran</h1>
      </div>
      <QuotationForm
        customers={customers}
        customerVehicles={vehicles}
        items={items}
        products={products}
        generatedCode={generatedCode}
        paymentMethods={paymentMethods}
        shippingMethods={shippingMethods}
      />
    </div>
  )
}
