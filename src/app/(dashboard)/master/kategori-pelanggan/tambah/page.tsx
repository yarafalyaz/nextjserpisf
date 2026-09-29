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
          { label: "Master Data", href: "/master" },
          { label: "Kategori Pelanggan", href: "/master/kategori-pelanggan" },
          { label: "Tambah" },
        ]}
      />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">
          Tambah Kategori Pelanggan
        </h1>
      </div>
      <CustomerCategoryForm />
    </div>
  )
}
