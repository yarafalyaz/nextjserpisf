import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { resolveEntity } from "@/lib/utils/resolve-entity"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { ProfitCenterForm } from "@/components/forms/profit-center-form"
import { notFound } from "next/navigation"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Ubah Pusat Laba" }

export default async function EditProfitCenterPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  await requirePermission("edit_profit_centers")
  const { slug } = await params

  // `ProfitCenter` tidak punya kolom slug, jadi segmen diperlakukan sebagai id
  // numerik; kode pusat laba juga diterima supaya tautannya bisa dibaca manusia.
  const center = await resolveEntity(
    { segment: slug, fallbackWhere: {} },
    {
      byId: (id) => prisma.profitCenter.findUnique({ where: { id } }),
      bySlug: (value) => prisma.profitCenter.findFirst({ where: { code: value } }),
    },
  )

  if (!center) notFound()

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs
        items={[
          { label: "Dasbor", href: "/" },
          { label: "Pusat Laba", href: "/keuangan/pusat-laba" },
          { label: "Ubah" },
        ]}
      />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Ubah Pusat Laba</h1>
      </div>
      <ProfitCenterForm
        center={{ id: center.id, code: center.code, name: center.name }}
      />
    </div>
  )
}
