export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { notFound } from "next/navigation"
import { TaxEditForm } from "./form"
import { EditPageShell } from "@/components/ui/edit-page-shell"
import { resolveEntity } from "@/lib/utils/resolve-entity"

import type { Metadata } from "next"

import { requirePermission } from "@/lib/auth/permissions"
export const metadata: Metadata = { title: "Ubah Pajak" }

export default async function EditTaxPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  await requirePermission("edit_taxes")

  const { slug } = await params
  const tax = await resolveEntity(
    { segment: slug },
    {
      bySlug: (s) => prisma.tax.findFirst({ where: { slug: s } }),
      byId: (id) => prisma.tax.findUnique({ where: { id } }),
    },
  )

  if (!tax) notFound()

  return (
    <EditPageShell
      breadcrumbs={[
        { label: "Dasbor", href: "/" },
        { label: "Data Master", href: "/master" },
        { label: "Pajak", href: "/master/pajak" },
        { label: "Ubah" },
      ]}
      title={`Ubah Pajak: ${tax.name}`}
    >
      <TaxEditForm tax={{ id: tax.id, name: tax.name, rate: Number(tax.rate) }} />
    </EditPageShell>
  )
}
