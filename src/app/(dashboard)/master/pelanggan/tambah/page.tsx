export const dynamic = "force-dynamic"

import { requirePermission } from "@/lib/auth/permissions"
import { CustomerForm } from "@/components/forms/customer-form"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { peekNextDocumentNumber } from "@/lib/utils/document-number"

export default async function CreateCustomerPage() {
  await requirePermission("create_customers")

  const generatedCode = await peekNextDocumentNumber("CUST", "simple")

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dashboard", href: "/" },
  { label: "Master Data", href: "/master" },
  { label: "Customers", href: "/master/pelanggan" },
  { label: "Create" },
]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Tambah Customer</h1>
      </div>
      <CustomerForm generatedCode={generatedCode} />
    </div>
  )
}
