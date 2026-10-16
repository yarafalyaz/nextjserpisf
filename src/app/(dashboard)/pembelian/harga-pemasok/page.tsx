export const dynamic = "force-dynamic"

import Link from "next/link"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { CanCreate } from "@/components/auth/can-create"
import { VendorPriceTable } from "./_components/vendor-price-table"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Harga Pemasok" }

export default async function VendorPricesPage() {
  await requirePermission("view_vendor_prices")

  const prices = await prisma.vendorItemPrice.findMany({
    orderBy: [{ vendorId: "asc" }, { itemId: "asc" }, { minQty: "asc" }],
    take: 500,
    include: {
      vendor: { select: { name: true } },
      item: { select: { sku: true, name: true } },
    },
  })

  const rows = prices.map((price) => ({
    id: price.id,
    vendorName: price.vendor.name,
    itemLabel: `${price.item.sku} — ${price.item.name}`,
    minQty: Number(price.minQty),
    price: Number(price.price),
    effectiveDate: price.effectiveDate ? price.effectiveDate.toLocaleDateString("id-ID") : null,
  }))

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs
        items={[
          { label: "Dasbor", href: "/" },
          { label: "Pembelian", href: "/pembelian" },
          { label: "Harga Pemasok" },
        ]}
      />
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Harga Pemasok</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Daftar harga kesepakatan per pemasok dan barang. Bersifat rujukan — dokumen pembelian
            belum otomatis memakai harga ini.
          </p>
        </div>
        <CanCreate permission="create_vendor_prices">
          <Link
            href="/pembelian/harga-pemasok/tambah"
            className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-all hover:bg-primary-hover"
            id="create-vendor-price-btn"
          >
            + Tambah Harga
          </Link>
        </CanCreate>
      </div>

      <VendorPriceTable data={rows} />
    </div>
  )
}
