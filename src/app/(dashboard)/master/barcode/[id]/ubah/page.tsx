export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { notFound } from "next/navigation"
import { requirePermission } from "@/lib/auth/permissions"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { BarcodeEditForm } from "./form"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Ubah Barcode" }

export default async function EditBarcodePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requirePermission("edit_barcodes")
  const { id } = await params
  const numId = Number(id)
  if (Number.isNaN(numId)) notFound()

  const data = await prisma.barcode.findUnique({ where: { id: numId } })
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
