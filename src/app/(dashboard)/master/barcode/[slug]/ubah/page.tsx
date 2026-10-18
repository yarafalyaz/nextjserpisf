export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { notFound } from "next/navigation"
import { requirePermission } from "@/lib/auth/permissions"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { BarcodeEditForm } from "./form"
import { resolveEntity } from "@/lib/utils/resolve-entity"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Ubah Barcode" }

export default async function EditBarcodePage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  await requirePermission("edit_barcodes")
  const { slug } = await params

  const data = await resolveEntity(
    { segment: slug },
    {
      bySlug: (s) => prisma.barcode.findFirst({ where: { slug: s } }),
      byId: (id) => prisma.barcode.findUnique({ where: { id } }),
    },
  )
  if (!data) notFound()

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
        { label: "Dasbor", href: "/" },
        { label: "Data Master", href: "/master" },
        { label: "Barcode", href: "/master/barcode" },
        { label: "Ubah" },
      ]} />
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">Ubah Barcode</h1>
      </div>
      <BarcodeEditForm id={data.id} barcode={data.barcode} itemId={data.itemId} type={data.type} />
    </div>
  )
}
