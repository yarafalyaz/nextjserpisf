export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { notFound } from "next/navigation"
import { requirePermission } from "@/lib/auth/permissions"
import { PaymentMethodForm } from "@/components/forms/payment-method-form"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { resolveEntity } from "@/lib/utils/resolve-entity"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Ubah Metode Pembayaran" }

export default async function EditPaymentMethodPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  await requirePermission("edit_payment_methods")
  const { slug } = await params

  const data = await resolveEntity(
    { segment: slug },
    {
      bySlug: (s) => prisma.paymentMethod.findFirst({ where: { slug: s } }),
      byId: (id) => prisma.paymentMethod.findUnique({ where: { id } }),
    },
  )
  if (!data) notFound()

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
        { label: "Dasbor", href: "/" },
        { label: "Master Data", href: "/master" },
        { label: "Metode Pembayaran", href: "/master/metode-pembayaran" },
        { label: "Ubah" },
      ]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Ubah Metode Pembayaran</h1>
      </div>
      <PaymentMethodForm method={{ id: data.id, code: data.code, name: data.name, isActive: data.isActive }} />
    </div>
  )
}
