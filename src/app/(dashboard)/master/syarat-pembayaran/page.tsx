export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import Link from "next/link"
import { PaymentTermTable } from "./_components/payment-term-table"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Syarat Pembayaran" }

export default async function PaymentTermsPage({
  searchParams,
}: {
  searchParams: Promise<{ cari?: string }>
}) {
  const params = await searchParams

  const where = {
    ...(params.cari && {
      OR: [
        { name: { contains: params.cari } },
        { code: { contains: params.cari } },
      ],
    }),
  }

  const paymentTerms = await prisma.paymentTerm.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 1000,
  })

  const tableData = JSON.parse(JSON.stringify(paymentTerms))

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[{ label: "Dasbor", href: "/" }, { label: "Master Data", href: "/master" }, { label: "Termin Pembayaran" }]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Termin Pembayaran</h1>
        <Link href="/master/syarat-pembayaran/tambah" className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all" id="create-payment-term-btn">
          + Tambah Termin
        </Link>
      </div>

      <PaymentTermTable data={tableData} />
    </div>
  )
}
