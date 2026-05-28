import { Table } from "@heroui/react"
import { ActionDropdown } from "@/components/ui/action-dropdown"
import { AppSearchField } from "@/components/ui/search-field"
import { deletePriceList } from "@/actions/master.actions"
export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import Link from "next/link"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

export default async function PriceListsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; search?: string }>
}) {
  const params = await searchParams
  const page = Number(params.page) || 1
  const perPage = 20

  const where = {
    ...(params.search && {
      name: { contains: params.search },
    }),
  }

  const [priceLists, total] = await Promise.all([
    prisma.priceList.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * perPage,
      take: perPage,
    }),
    prisma.priceList.count({ where }),
  ])

  const totalPages = Math.ceil(total / perPage)

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dashboard", href: "/" },
  { label: "Master Data", href: "/master" },
  { label: "Price Lists" },
]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Daftar Harga</h1>
        <Link href="/master/price-lists/create" className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all" id="create-price-list-btn">
          + Tambah Daftar Harga
        </Link>
      </div>

      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
        <div className="p-3 px-4 flex flex-col gap-3">
          <AppSearchField placeholder="Cari nama daftar harga..." action="/master/daftar-harga" />
        </div>

        <Table>
          <Table.ScrollContainer>
            <Table.Content aria-label="Daftar price list">
              <Table.Header>
                <Table.Column isRowHeader>ID</Table.Column>
                <Table.Column>Nama</Table.Column>
                <Table.Column>Status</Table.Column>
                <Table.Column className="text-end">Aksi</Table.Column>
              </Table.Header>
              <Table.Body>
                {priceLists.length === 0 ? (
                  <Table.Row>
                    <Table.Cell colSpan={4} className="text-center py-10 px-4 text-muted">Tidak ada data daftar harga</Table.Cell>
                  </Table.Row>
                ) : (
                  priceLists.map((pl) => (
                    <Table.Row key={pl.id}>
                      <Table.Cell>{pl.id}</Table.Cell>
                      <Table.Cell className="font-medium">{pl.name}</Table.Cell>
                      <Table.Cell>
                        <span className={`badge ${pl.isActive ? "badge-success" : "badge-secondary"}`}>
                          {pl.isActive ? "Aktif" : "Nonaktif"}
                        </span>
                      </Table.Cell>
                      <Table.Cell className="text-end">
                        <ActionDropdown
                          deleteAction={deletePriceList}
                          deleteId={pl.id}
                        />
                      </Table.Cell>
                    </Table.Row>
                  ))
                )}
              </Table.Body>
            </Table.Content>
          </Table.ScrollContainer>
        </Table>

        {totalPages > 1 && (
          <div className="flex items-center justify-between p-3 px-5 border-t border-default">
            <span className="text-[0.8125rem] text-muted">
              Hal {page} dari {totalPages} ({total} data)
            </span>
            <div className="flex gap-1">
              {page > 1 && (
                <Link href={`/master/price-lists?page=${page - 1}&search=${params.search || ""}`} className="button button--ghost button--sm">← Prev</Link>
              )}
              {page < totalPages && (
                <Link href={`/master/price-lists?page=${page + 1}&search=${params.search || ""}`} className="button button--ghost button--sm">Next →</Link>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
