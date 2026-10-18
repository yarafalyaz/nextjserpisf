export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { PositionCreateForm } from "./form"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { peekNextDocumentNumber } from "@/lib/utils/document-number"

import type { Metadata } from "next"

import { requirePermission } from "@/lib/auth/permissions"
export const metadata: Metadata = { title: "Tambah Jabatan" }

export default async function CreatePositionPage() {
  await requirePermission("create_positions")

  const [departments, generatedCode] = await Promise.all([
    prisma.department.findMany({ orderBy: { name: "asc" } }),
    peekNextDocumentNumber("POS", "simple"),
  ])

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dasbor", href: "/" },
  { label: "Data Master", href: "/master" },
  { label: "Jabatan", href: "/master/jabatan" },
  { label: "Buat" },
]} />
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">Tambah Jabatan</h1>
      </div>
      <PositionCreateForm departments={departments} generatedCode={generatedCode} />
    </div>
  )
}
