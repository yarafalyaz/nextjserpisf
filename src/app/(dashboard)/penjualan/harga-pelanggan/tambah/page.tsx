export const dynamic = "force-dynamic"

import { requirePermission } from "@/lib/auth/permissions"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { CustomerPriceForm } from "../_components/customer-price-form"
import { loadCustomerPriceOptions } from "../_lib/options"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Tambah Daftar Harga Pelanggan" }

export default async function CreateCustomerPricePage() {
  await requirePermission("create_customer_price_lists")
  const { categoryOptions, itemOptions } = await loadCustomerPriceOptions()

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs
        items={[
          { label: "Dasbor", href: "/" },
          { label: "Penjualan", href: "/penjualan" },
          { label: "Daftar Harga Pelanggan", href: "/penjualan/harga-pelanggan" },
          { label: "Tambah" },
        ]}
      />
      <h1 className="text-2xl font-bold text-foreground">Tambah Daftar Harga Pelanggan</h1>
      <CustomerPriceForm categoryOptions={categoryOptions} itemOptions={itemOptions} />
    </div>
  )
}
