export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { notFound } from "next/navigation"
import { EditPaymentTermForm } from "./form"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { resolveEntity } from "@/lib/utils/resolve-entity"

import type { Metadata } from "next"

import { requirePermission } from "@/lib/auth/permissions"
export const metadata: Metadata = { title: "Ubah Syarat Pembayaran" }

export default async function EditPaymentTermPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  await requirePermission("edit_payment_terms")

  const { slug } = await params

  const paymentTerm = await resolveEntity(
    { segment: slug },
    {
      bySlug: (s) => prisma.paymentTerm.findFirst({ where: { slug: s } }),
      byId: (id) => prisma.paymentTerm.findUnique({ where: { id } }),
    },
  )

  if (!paymentTerm) notFound()

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dasbor", href: "/" },
  { label: "Data Master", href: "/master" },
  { label: "Termin Pembayaran", href: "/master/syarat-pembayaran" },
  { label: "Ubah" },
]} />
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">Ubah Termin: {paymentTerm.name}</h1>
      </div>
      <EditPaymentTermForm paymentTerm={paymentTerm} />
    </div>
  )
}
