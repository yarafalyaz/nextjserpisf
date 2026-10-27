export const dynamic = "force-dynamic"

import { notFound } from "next/navigation"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { CustomerPriceForm } from "../../_components/customer-price-form"
import { loadCustomerPriceOptions } from "../../_lib/options"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Ubah Daftar Harga Pelanggan" }

export default async function EditCustomerPricePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requirePermission("edit_customer_price_lists")

  const { id } = await params
  const priceId = Number(id)
  if (!Number.isInteger(priceId) || priceId <= 0) notFound()

  const [price, options] = await Promise.all([
    prisma.customerPriceList.findUnique({
      where: { id: priceId },
      select: {
        id: true,
        customerCategoryId: true,
        itemId: true,
        price: true,
        minQty: true,
        effectiveDate: true,
        expiresAt: true,
        notes: true,
      },
    }),
    loadCustomerPriceOptions(),
  ])
  if (!price) notFound()

  const toDateInput = (date: Date | null) =>
    date
      ? [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-")
      : ""

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs
        items={[
          { label: "Dasbor", href: "/" },
          { label: "Penjualan", href: "/penjualan" },
          { label: "Daftar Harga Pelanggan", href: "/penjualan/harga-pelanggan" },
          { label: "Ubah" },
        ]}
      />
      <h1 className="text-2xl font-bold text-foreground">Ubah Daftar Harga Pelanggan</h1>
      <CustomerPriceForm
        categoryOptions={options.categoryOptions}
        itemOptions={options.itemOptions}
        initial={{
          id: price.id,
          customerCategoryId: price.customerCategoryId ? String(price.customerCategoryId) : "",
          itemId: String(price.itemId),
          price: String(Number(price.price)),
          minQty: String(Number(price.minQty)),
          effectiveDate: toDateInput(price.effectiveDate),
          expiresAt: toDateInput(price.expiresAt),
          notes: price.notes ?? "",
        }}
      />
    </div>
  )
}
