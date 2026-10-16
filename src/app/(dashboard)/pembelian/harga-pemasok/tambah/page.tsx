export const dynamic = "force-dynamic"

import { requirePermission } from "@/lib/auth/permissions"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { VendorPriceForm } from "../_components/vendor-price-form"
import { loadVendorPriceOptions } from "../_lib/options"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Tambah Harga Pemasok" }

export default async function CreateVendorPricePage() {
  await requirePermission("create_vendor_prices")
  const { vendorOptions, itemOptions } = await loadVendorPriceOptions()

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs
        items={[
          { label: "Dasbor", href: "/" },
          { label: "Pembelian", href: "/pembelian" },
          { label: "Harga Pemasok", href: "/pembelian/harga-pemasok" },
          { label: "Tambah" },
        ]}
      />
      <h1 className="text-2xl font-bold text-foreground">Tambah Harga Pemasok</h1>
      <VendorPriceForm vendorOptions={vendorOptions} itemOptions={itemOptions} />
    </div>
  )
}
