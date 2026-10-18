import { parsePagination } from "@/lib/utils/pagination"
export const dynamic = "force-dynamic"

import { toPlain } from "@/lib/utils/serialization"
import { prisma } from "@/lib/db/prisma"
import Link from "next/link"
import { PaymentMethodTable } from "./_components/payment-method-table"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

import type { Metadata } from "next"

import { requirePermission } from "@/lib/auth/permissions"
import { CanCreate } from "@/components/auth/can-create"
export const metadata: Metadata = { title: "Metode Pembayaran" }

export default async function PaymentMethodsPage({
  searchParams,
}: {
  searchParams: Promise<{ cari?: string; halaman?: string; pageSize?: string }>
}) {
  await requirePermission("view_payment_methods")

  const params = await searchParams
  const { page, pageSize, take } = parsePagination(params)

  const where = {
    ...(params.cari && {
      OR: [
        { name: { contains: params.cari } },
        { code: { contains: params.cari } },
      ],
    }),
  }

  const rows = await prisma.paymentMethod.findMany({ where, orderBy: { name: "asc" }, take,
    skip: (page - 1) * pageSize })
  const total = await prisma.paymentMethod.count({ where })

  const tableData = toPlain(rows)

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[{ label: "Dasbor", href: "/" }, { label: "Data Master", href: "/master" }, { label: "Metode Pembayaran" }]} />
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">Metode Pembayaran</h1>
        <CanCreate permission="create_payment_methods">
          <Link href="/master/metode-pembayaran/tambah" className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all" id="create-payment-method-btn">
          + Tambah Metode Pembayaran
        </Link>
        </CanCreate>
      </div>

      <PaymentMethodTable data={tableData} total={total} page={page} pageSize={pageSize} />
    </div>
  )
}
