import { Table } from "@heroui/react"
import { ActionDropdown } from "@/components/ui/action-dropdown"
import { AppSearchField } from "@/components/ui/search-field"
import { deleteBarcode } from "@/actions/master.actions"
export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import Link from "next/link"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

export default async function BarcodesPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; search?: string }>
}) {
  const params = await searchParams
  const page = Number(params.page) || 1
  const perPage = 20

  const where = {
    ...(params.search && {
      barcode: { contains: params.search },
    }),
  }

  const [barcodes, total] = await Promise.all([
    prisma.barcode.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * perPage,
      take: perPage,
      include: { item: { select: { name: true } } },
    }),
    prisma.barcode.count({ where }),
  ])

  const totalPages = Math.ceil(total / perPage)

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dashboard", href: "/" },
  { label: "Master Data", href: "/master" },
  { label: "Barcodes" },
]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Barcode</h1>
        <Link href="/master/barcodes/create" className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all" id="create-barcode-btn">
          + Tambah Barcode
        </Link>
      </div>

      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
        <div className="p-3 px-4 flex flex-col gap-3">
          <AppSearchField placeholder="Cari barcode..." action="/master/barcodes" />
        </div>

        <Table>
          <Table.ScrollContainer>
            <Table.Content aria-label="Daftar barcode">
              <Table.Header>
                <Table.Column isRowHeader>ID</Table.Column>
                <Table.Column>Barcode</Table.Column>
                <Table.Column>Item</Table.Column>
                <Table.Column>Type</Table.Column>
                <Table.Column className="text-end">Aksi</Table.Column>
              </Table.Header>
              <Table.Body>
                {barcodes.length === 0 ? (
                  <Table.Row>
                    <Table.Cell colSpan={5} className="text-center py-10 px-4 text-muted">Tidak ada data barcode</Table.Cell>
                  </Table.Row>
                ) : (
                  barcodes.map((b) => (
                    <Table.Row key={b.id}>
                      <Table.Cell>{b.id}</Table.Cell>
                      <Table.Cell className="font-medium">{b.barcode}</Table.Cell>
                      <Table.Cell>{b.item.name}</Table.Cell>
                      <Table.Cell>{b.type}</Table.Cell>
                      <Table.Cell className="text-end">
                        <ActionDropdown
                          deleteAction={deleteBarcode}
                          deleteId={b.id}
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
                <Link href={`/master/barcodes?page=${page - 1}&search=${params.search || ""}`} className="button button--ghost button--sm">← Prev</Link>
              )}
              {page < totalPages && (
                <Link href={`/master/barcodes?page=${page + 1}&search=${params.search || ""}`} className="button button--ghost button--sm">Next →</Link>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
