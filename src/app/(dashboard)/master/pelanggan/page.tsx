import { Plus } from "@/components/ui/fontawesome-icons";
import { parsePagination } from "@/lib/utils/pagination"
export const dynamic = "force-dynamic"

import { toPlain } from "@/lib/utils/serialization"
import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import Link from "next/link"
import { CustomerTable } from "./_components/customer-table"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

import type { Metadata } from "next"
import { CanCreate } from "@/components/auth/can-create"
import { listCustomerDuplicateCandidates } from "@/actions/master.actions"
import { CustomerDuplicateGroups } from "./_components/customer-duplicate-groups"

export const metadata: Metadata = { title: "Pelanggan" }

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ cari?: string; halaman?: string; pageSize?: string }>
}) {
  await requirePermission("view_customers")

  const params = await searchParams
  const { page, pageSize, take } = parsePagination(params)

  const where = {
    deletedAt: null,
    ...(params.cari && {
      OR: [
        { name: { contains: params.cari } },
        { code: { contains: params.cari } },
        { phone: { contains: params.cari } },
      ],
    }),
  }

  // findMany + count independen atas where sama: paralel; select hanya
  // kolom yang dibaca CustomerTable.
  const [customers, total] = await Promise.all([
    prisma.customer.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take,
      skip: (page - 1) * pageSize,
      select: { id: true, name: true, slug: true, code: true, phone: true, isActive: true },
    }),
    prisma.customer.count({ where }),
  ])


  const tableData = toPlain(customers)

  // AC-CD-F2: daftar kandidat duplikat bergrup (server, view_customers);
  // gagal muat tidak memblokir daftar utama.
  const duplicateResult = await listCustomerDuplicateCandidates()
  const duplicateGroups = duplicateResult.success ? (duplicateResult.groups ?? []) : []


  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[{ label: "Dasbor", href: "/" }, { label: "Data Master", href: "/master" }, { label: "Pelanggan" }]} />
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">Pelanggan</h1>
<CanCreate permission="create_customers">
          <Link href="/master/pelanggan/tambah" className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary-hover hover:shadow-md transition-all" id="create-customer-btn">
            <Plus className="size-3.5" />
            <span>Tambah Pelanggan</span>
          </Link>
        </CanCreate>
      </div>

      <CustomerDuplicateGroups groups={duplicateGroups} />

      <CustomerTable data={tableData} total={total} page={page} pageSize={pageSize} />
    </div>
  )
}
