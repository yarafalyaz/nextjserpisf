export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { notFound } from "next/navigation"
import Link from "next/link"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

import type { Metadata } from "next"

import { requirePermission } from "@/lib/auth/permissions"
export const metadata: Metadata = { title: "Syarat Pembayaran" }

export default async function PaymentTermDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requirePermission("view_payment_terms")

  const { id } = await params
  const numId = Number(id)
  if (Number.isNaN(numId)) notFound()

  const paymentTerm = await prisma.paymentTerm.findUnique({
    where: { id: numId },
  })

  if (!paymentTerm) notFound()

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dasbor", href: "/" },
  { label: "Master Data", href: "/master" },
  { label: "Termin Pembayaran", href: "/master/syarat-pembayaran" },
  { label: paymentTerm.name },
]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">{paymentTerm.name}</h1>
        <Link href={`/master/syarat-pembayaran/${paymentTerm.id}/ubah`} className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all">
          Ubah
        </Link>
      </div>

      <div className="bg-surface rounded-xl border border-default shadow-sm p-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-foreground">Kode</label>
            <p className="font-mono">{paymentTerm.code}</p>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-foreground">Nama</label>
            <p>{paymentTerm.name}</p>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-foreground">Jumlah Hari</label>
            <p>{paymentTerm.days} hari</p>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-foreground">Status</label>
            <span className={`badge ${paymentTerm.isActive ? "badge-success" : "badge-secondary"}`}>
              {paymentTerm.isActive ? "Aktif" : "Nonaktif"}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
