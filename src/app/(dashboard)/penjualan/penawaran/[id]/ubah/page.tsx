export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { notFound } from "next/navigation"
import { QuotationForm } from "@/components/forms/quotation-form"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Ubah Penawaran" }

export default async function EditQuotationPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const data = await prisma.quotation.findUnique({
    where: { id: Number(id) },
    include: { sections: { include: { items: true } } },
  })

  if (!data) notFound()

  const [customers, customerVehicles, items, paymentMethods, shippingMethods] = await Promise.all([
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
    prisma.paymentMethod.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { code: true, name: true } }),
    prisma.shippingMethod.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { code: true, name: true } }),
  ])

  const quotation = {
    ...data,
    date: data.date.toISOString().split("T")[0],
    validUntil: data.validUntil?.toISOString().split("T")[0] ?? null,
    deletedAt: data.deletedAt?.toISOString() ?? null,
    createdAt: data.createdAt.toISOString(),
    updatedAt: data.updatedAt.toISOString(),
    subtotal: Number(data.subtotal),
    discount: Number(data.discount),
    tax: Number(data.tax),
    grandTotal: Number(data.grandTotal),
    sections: data.sections.map((section) => ({
      ...section,
      createdAt: section.createdAt.toISOString(),
      updatedAt: section.updatedAt.toISOString(),
      items: section.items.map((item) => ({
        ...item,
        qty: Number(item.qty),
        unitPrice: Number(item.unitPrice),
        discount: Number(item.discount),
        total: Number(item.total),
        createdAt: item.createdAt.toISOString(),
        updatedAt: item.updatedAt.toISOString(),
      })),
    })),
  }

  const itemOptions = items.map((item) => ({
    ...item,
    price: Number(item.price),
  }))

  const customerVehicleOptions = customerVehicles.map((customerVehicle) => {
    const vehicle = customerVehicle.vehicle
    const model = vehicle?.variant?.model
    return {
      id: customerVehicle.id,
      customerId: customerVehicle.customerId,
      plateNumber: customerVehicle.licensePlate || vehicle?.plateNumber || "-",
      brandName: model?.brand?.name || "",
      modelName: model?.name || "",
    }
  })

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dasbor", href: "/" },
  { label: "Penjualan", href: "/penjualan/penawaran" },
  { label: "Penawaran", href: "/penjualan/penawaran" },
  { label: "Ubah" },
]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Ubah Penawaran</h1>
      </div>
      <QuotationForm quotation={quotation} customers={customers}
        customerVehicles={customerVehicleOptions}
        items={itemOptions}
        paymentMethods={paymentMethods}
        shippingMethods={shippingMethods} />
    </div>
  )
}
