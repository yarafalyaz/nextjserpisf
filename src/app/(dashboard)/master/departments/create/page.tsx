export const dynamic = "force-dynamic"

import { peekNextDocumentNumber } from "@/lib/utils/document-number"
import { DepartmentCreateForm } from "./form"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

export default async function CreateDepartmentPage() {
  const generatedCode = await peekNextDocumentNumber("DEPT", "simple")

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dashboard", href: "/" },
  { label: "Master Data", href: "/master" },
  { label: "Departments", href: "/master/departments" },
  { label: "Create" },
]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Tambah Departemen</h1>
      </div>
      <DepartmentCreateForm generatedCode={generatedCode} />
    </div>
  )
}
