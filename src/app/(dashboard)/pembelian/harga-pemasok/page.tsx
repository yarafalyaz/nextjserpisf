import { Plus } from "@/components/ui/fontawesome-icons";
export const dynamic = "force-dynamic"

import Link from "next/link"

import { prisma } from "@/lib/db/prisma"
import { hasPermission, requirePermission } from "@/lib/auth/permissions"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { CanCreate } from "@/components/auth/can-create"
import { VendorPriceTable } from "./_components/vendor-price-table"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Harga Pemasok" }

export default async function VendorPricesPage() {
  await requirePermission("view_vendor_prices")

  // Tautan Ubah per baris menuju halaman yang menuntut edit_vendor_prices;
  // tanpa gerbang, peran lihat-saja melihatnya lalu terpental diam ke dasbor.
  const canEdit = await hasPermission("edit_vendor_prices")

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
            className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 min-h-11 sm:min-h-9 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-2xs cursor-pointer"
            id="create-vendor-price-btn"
          >
            <Plus className="size-3.5" aria-hidden="true" />
            <span>Tambah Harga</span>
          </Link>
        </CanCreate>
      </div>

      <VendorPriceTable data={rows} canEdit={canEdit} />
    </div>
  )
}
