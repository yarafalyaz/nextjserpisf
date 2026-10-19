export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { notFound } from "next/navigation"
import Link from "next/link"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { resolveEntity } from "@/lib/utils/resolve-entity"
import { entityEditHref } from "@/lib/utils/entity-url"

import type { Metadata } from "next"

import { requirePermission } from "@/lib/auth/permissions"
export const metadata: Metadata = { title: "Syarat Pembayaran" }

export default async function PaymentTermDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  await requirePermission("view_payment_terms")

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
  { label: paymentTerm.name },
]} />
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">{paymentTerm.name}</h1>
        <Link href={entityEditHref("/master/syarat-pembayaran", paymentTerm)} className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all">
          Ubah
        </Link>
      </div>

      <div className="bg-surface rounded-xl border border-default shadow-sm p-4 sm:p-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-foreground">Kode</span>
            <p className="font-mono">{paymentTerm.code}</p>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-foreground">Nama</span>
            <p>{paymentTerm.name}</p>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-foreground">Jumlah Hari</span>
            <p>{paymentTerm.days} hari</p>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-foreground">Status</span>
            <span className={`badge ${paymentTerm.isActive ? "badge-success" : "badge-secondary"}`}>
              {paymentTerm.isActive ? "Aktif" : "Nonaktif"}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
