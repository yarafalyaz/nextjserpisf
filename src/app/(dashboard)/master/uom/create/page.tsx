export const dynamic = "force-dynamic"

import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { UomForm } from "./form"

export default function CreateUomPage() {
  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
        { label: "Dashboard", href: "/" },
        { label: "Master Data" },
        { label: "UoM", href: "/master/uom" },
        { label: "Create" },
      ]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Tambah Satuan</h1>
      </div>
      <UomForm />
    </div>
  )
}
