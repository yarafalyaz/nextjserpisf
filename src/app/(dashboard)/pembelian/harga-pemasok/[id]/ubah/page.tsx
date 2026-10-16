export const dynamic = "force-dynamic"

import { notFound } from "next/navigation"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { VendorPriceForm } from "../../_components/vendor-price-form"
import { loadVendorPriceOptions } from "../../_lib/options"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Ubah Harga Pemasok" }

export default async function EditVendorPricePage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("edit_vendor_prices")

  const { id } = await params
  const priceId = Number(id)
  if (!Number.isInteger(priceId) || priceId <= 0) notFound()

  const [price, options] = await Promise.all([
    prisma.vendorItemPrice.findUnique({
      where: { id: priceId },
      select: {
        id: true,
        vendorId: true,
        itemId: true,
        price: true,
        minQty: true,
        effectiveDate: true,
        notes: true,
      },
    }),
    loadVendorPriceOptions(),
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
          { label: "Pembelian", href: "/pembelian" },
          { label: "Harga Pemasok", href: "/pembelian/harga-pemasok" },
          { label: "Ubah" },
        ]}
      />
      <h1 className="text-2xl font-bold text-foreground">Ubah Harga Pemasok</h1>
      <VendorPriceForm
        vendorOptions={options.vendorOptions}
        itemOptions={options.itemOptions}
        initial={{
          id: price.id,
          vendorId: String(price.vendorId),
          itemId: String(price.itemId),
          price: String(Number(price.price)),
          minQty: String(Number(price.minQty)),
          effectiveDate: toDateInput(price.effectiveDate),
          notes: price.notes ?? "",
        }}
      />
    </div>
  )
}
