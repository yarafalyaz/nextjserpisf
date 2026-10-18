export const dynamic = "force-dynamic"

import { peekNextDocumentNumber } from "@/lib/utils/document-number"
import { DepartmentCreateForm } from "./form"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

import type { Metadata } from "next"

import { requirePermission } from "@/lib/auth/permissions"
export const metadata: Metadata = { title: "Tambah Departemen" }

export default async function CreateDepartmentPage() {
  await requirePermission("edit_departments")

  const generatedCode = await peekNextDocumentNumber("DEPT", "simple")

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dasbor", href: "/" },
  { label: "Data Master", href: "/master" },
  { label: "Departemen", href: "/master/departemen" },
  { label: "Buat" },
]} />
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">Tambah Departemen</h1>
      </div>
      <DepartmentCreateForm generatedCode={generatedCode} />
    </div>
  )
}
