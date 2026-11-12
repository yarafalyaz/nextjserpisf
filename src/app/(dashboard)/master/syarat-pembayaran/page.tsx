import { Plus } from "@/components/ui/fontawesome-icons";
export const dynamic = "force-dynamic"

import { toPlain } from "@/lib/utils/serialization"
import { prisma } from "@/lib/db/prisma"
import { parsePagination } from "@/lib/utils/pagination"
import Link from "next/link"
import { PaymentTermTable } from "./_components/payment-term-table"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

import type { Metadata } from "next"

import { requirePermission } from "@/lib/auth/permissions"
import { CanCreate } from "@/components/auth/can-create"
export const metadata: Metadata = { title: "Syarat Pembayaran" }

export default async function PaymentTermsPage({
  searchParams,
}: {
  searchParams: Promise<{ cari?: string; halaman?: string; pageSize?: string }>
}) {
  await requirePermission("view_payment_terms")

  const params = await searchParams
  const { page, pageSize, skip, take } = parsePagination(params)

  const where = {
    ...(params.cari && {
      OR: [
        { name: { contains: params.cari } },
        { code: { contains: params.cari } },
      ],
    }),
  }

  const [paymentTerms, total] = await Promise.all([
    prisma.paymentTerm.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take,
      skip,
    }),
    prisma.paymentTerm.count({ where }),
  ])

  const tableData = toPlain(paymentTerms)

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[{ label: "Dasbor", href: "/" }, { label: "Data Master", href: "/master" }, { label: "Termin Pembayaran" }]} />
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between pb-2 border-b border-border">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground text-balance">
            Termin & Syarat Pembayaran (Payment Terms)
          </h1>
          <p className="mt-0.5 text-xs text-muted-foreground text-pretty">
            Konfigurasi jangka waktu kredit, jatuh tempo tempo pembayaran (TOP), dan potongan pelunasan cepat.
          </p>
        </div>
        <CanCreate permission="create_payment_terms">
          <Link
            href="/master/syarat-pembayaran/tambah"
            className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 min-h-11 sm:min-h-9 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-2xs cursor-pointer"
            id="create-payment-term-btn"
          >
            <Plus className="size-3.5" aria-hidden="true" />
            <span>Tambah Termin</span>
          </Link>
        </CanCreate>
      </div>

      <PaymentTermTable data={tableData} total={total} page={page} pageSize={pageSize} />
    </div>
  )
}
