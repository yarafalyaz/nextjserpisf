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
        { label: "Master Data", href: "/master" },
        { label: "Barcode", href: "/master/barcode" },
        { label: "Ubah" },
      ]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Ubah Barcode</h1>
      </div>
      <BarcodeEditForm id={data.id} barcode={data.barcode} itemId={data.itemId} type={data.type} />
    </div>
  )
}
