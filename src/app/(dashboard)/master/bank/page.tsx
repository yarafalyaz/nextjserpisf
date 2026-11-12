import { Plus } from "@/components/ui/fontawesome-icons";
import { parsePagination } from "@/lib/utils/pagination"
export const dynamic = "force-dynamic"

import { toPlain } from "@/lib/utils/serialization"
import { prisma } from "@/lib/db/prisma"
import Link from "next/link"
import { BankTable } from "./_components/bank-table"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

import type { Metadata } from "next"

import { requirePermission } from "@/lib/auth/permissions"
import { CanCreate } from "@/components/auth/can-create"
export const metadata: Metadata = { title: "Bank" }

export default async function BanksPage({
  searchParams,
}: {
  searchParams: Promise<{ cari?: string; halaman?: string; pageSize?: string }>
}) {
  await requirePermission("view_banks")

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

  const banks = await prisma.bank.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take,
    skip: (page - 1) * pageSize,
  })

  const total = await prisma.bank.count({ where })

  const tableData = toPlain(banks)


  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[{ label: "Dasbor", href: "/" }, { label: "Data Master", href: "/master" }, { label: "Bank" }]} />
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between pb-2 border-b border-border">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground text-balance">
            Daftar Bank Rekening
          </h1>
          <p className="mt-0.5 text-xs text-muted-foreground text-pretty">
            Katalog institusi perbankan mitra, kode transfer kliring/RTGS, dan integrasi rekening kas operasional.
          </p>
        </div>
        <CanCreate permission="create_banks">
          <Link
            href="/master/bank/tambah"
            className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 min-h-11 sm:min-h-9 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-2xs cursor-pointer"
            id="create-bank-btn"
          >
            <Plus className="size-3.5" aria-hidden="true" />
            <span>Tambah Bank</span>
          </Link>
        </CanCreate>
      </div>

      <BankTable data={tableData} total={total} page={page} pageSize={pageSize} />
    </div>
  )
}
