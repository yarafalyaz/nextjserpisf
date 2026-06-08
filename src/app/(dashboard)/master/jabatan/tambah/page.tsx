export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { PositionCreateForm } from "./form"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { peekNextDocumentNumber } from "@/lib/utils/document-number"

export default async function CreatePositionPage() {
  const [departments, generatedCode] = await Promise.all([
    prisma.department.findMany({ orderBy: { name: "asc" } }),
    peekNextDocumentNumber("POS", "simple"),
  ])

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dasbor", href: "/" },
  { label: "Master Data", href: "/master" },
  { label: "Jabatan", href: "/master/jabatan" },
  { label: "Buat" },
]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Tambah Jabatan</h1>
      </div>
      <PositionCreateForm departments={departments} generatedCode={generatedCode} />
    </div>
  )
}
