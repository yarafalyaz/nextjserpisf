export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { notFound } from "next/navigation"
import { requirePermission } from "@/lib/auth/permissions"
import { resolveEntity } from "@/lib/utils/resolve-entity"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { KeyFigureEditForm } from "./form"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Ubah Angka Kunci Statistik" }

export default async function EditKeyFigurePage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  await requirePermission("edit_accounts")
  const { slug } = await params

  const data = await resolveEntity(
    { segment: slug, fallbackWhere: {} },
    {
      bySlug: (s) => prisma.statisticalKeyFigure.findFirst({ where: { slug: s } }),
      byId: (id) => prisma.statisticalKeyFigure.findUnique({ where: { id } }),
    },
  )
  if (!data) notFound()

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
        { label: "Dasbor", href: "/" },
        { label: "Keuangan", href: "/keuangan" },
        { label: "Angka Kunci Statistik", href: "/keuangan/angka-kunci-statistik" },
        { label: "Ubah" },
      ]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Ubah Angka Kunci Statistik</h1>
      </div>
      <KeyFigureEditForm id={data.id} name={data.name} unit={data.unit} value={Number(data.value)} code={data.code} type={data.type} isActive={data.isActive} />
    </div>
  )
}
