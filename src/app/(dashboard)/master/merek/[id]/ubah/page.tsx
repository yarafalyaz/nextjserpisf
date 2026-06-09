export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { notFound } from "next/navigation"
import { BrandEditForm } from "./_form"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Ubah Merek Kendaraan" }

export default async function EditBrandPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const brand = await prisma.brand.findUnique({
    where: { id: Number(id) },
  })

  if (!brand) notFound()

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
        { label: "Dasbor", href: "/" },
        { label: "Master Data", href: "/master" },
        { label: "Merek", href: "/master/merek" },
        { label: "Ubah" },
      ]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Ubah Merek</h1>
      </div>
      <BrandEditForm brand={JSON.parse(JSON.stringify(brand))} />
    </div>
  )
}
