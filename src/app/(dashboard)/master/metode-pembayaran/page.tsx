export const dynamic = "force-dynamic"

import { toPlain } from "@/lib/utils/serialization"
import { prisma } from "@/lib/db/prisma"
import Link from "next/link"
import { PaymentMethodTable } from "./_components/payment-method-table"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

import type { Metadata } from "next"

import { requirePermission } from "@/lib/auth/permissions"
export const metadata: Metadata = { title: "Metode Pembayaran" }

export default async function PaymentMethodsPage({
  searchParams,
}: {
  searchParams: Promise<{ cari?: string }>
}) {
  await requirePermission("view_payment_methods")

  const params = await searchParams

  const where = {
    ...(params.cari && {
      OR: [
        { name: { contains: params.cari } },
        { code: { contains: params.cari } },
      ],
    }),
  }

  const rows = await prisma.paymentMethod.findMany({ where, orderBy: { name: "asc" }, take: 1000 })
  const tableData = toPlain(rows) as any

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[{ label: "Dasbor", href: "/" }, { label: "Master Data", href: "/master" }, { label: "Metode Pembayaran" }]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Metode Pembayaran</h1>
        <Link href="/master/metode-pembayaran/tambah" className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all" id="create-payment-method-btn">
          + Tambah Metode Pembayaran
        </Link>
      </div>

      <PaymentMethodTable data={tableData} />
    </div>
  )
}
