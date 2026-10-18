import { requirePermission } from "@/lib/auth/permissions"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { CustomerCategoryForm } from "@/components/forms/customer-category-form"

import type { Metadata } from "next"
export const metadata: Metadata = { title: "Tambah Kategori Pelanggan" }

export default async function CreateCustomerCategoryPage() {
  await requirePermission("create_customers")

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs
        items={[
          { label: "Dasbor", href: "/" },
          { label: "Data Master", href: "/master" },
          { label: "Kategori Pelanggan", href: "/master/kategori-pelanggan" },
          { label: "Tambah" },
        ]}
      />
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">
          Tambah Kategori Pelanggan
        </h1>
      </div>
      <CustomerCategoryForm />
    </div>
  )
}
