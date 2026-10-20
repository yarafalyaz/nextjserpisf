export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { notFound } from "next/navigation"
import { EditPaymentTermForm } from "./form"
import { EditPageShell } from "@/components/ui/edit-page-shell"
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
    <EditPageShell
      breadcrumbs={[
        { label: "Dasbor", href: "/" },
        { label: "Data Master", href: "/master" },
        { label: "Termin Pembayaran", href: "/master/syarat-pembayaran" },
        { label: "Ubah" },
      ]}
      title={`Ubah Termin: ${paymentTerm.name}`}
    >
      <EditPaymentTermForm paymentTerm={paymentTerm} />
    </EditPageShell>
  )
}
