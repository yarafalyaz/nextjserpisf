import { Table } from "@heroui/react"
import { ActionDropdown } from "@/components/ui/action-dropdown"
import { AppSearchField } from "@/components/ui/search-field"
import { deleteTaxGroup } from "@/actions/master.actions"
export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import Link from "next/link"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

export default async function TaxGroupsPage({
  searchParams,
}: {
  searchParams: Promise<{ halaman?: string; cari?: string }>
}) {
  const params = await searchParams
  const page = Number(params.halaman) || 1
  const perPage = 20

  const where = {
    ...(params.cari && {
      name: { contains: params.cari },
    }),
  }

  const [taxGroups, total, allTaxes] = await Promise.all([
    prisma.taxGroup.findMany({
      where,
      include: { taxes: true },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * perPage,
      take: perPage,
    }),
    prisma.taxGroup.count({ where }),
    prisma.tax.findMany({ where: { isActive: true } }),
  ])

  const totalPages = Math.ceil(total / perPage)
  const taxMap = new Map(allTaxes.map((t) => [t.id, t.name]))

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dashboard", href: "/" },
  { label: "Master Data", href: "/master" },
  { label: "Tax Groups" },
]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Grup Pajak</h1>
        <Link href="/master/kelompok-pajak/create" className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all" id="create-tax-group-btn">
          + Tambah Grup Pajak
        </Link>
      </div>

      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
        <div className="p-3 px-4 flex flex-col gap-3">
          <AppSearchField placeholder="Cari nama grup pajak..." action="/master/kelompok-pajak" />
        </div>

        <Table>
          <Table.ScrollContainer>
            <Table.Content aria-label="Daftar grup pajak">
              <Table.Header>
                <Table.Column isRowHeader>ID</Table.Column>
                <Table.Column>Nama</Table.Column>
                <Table.Column>Pajak Termasuk</Table.Column>
                <Table.Column className="text-end">Aksi</Table.Column>
              </Table.Header>
              <Table.Body>
                {taxGroups.length === 0 ? (
                  <Table.Row>
                    <Table.Cell colSpan={4} className="text-center py-10 px-4 text-muted">Tidak ada data grup pajak</Table.Cell>
                  </Table.Row>
                ) : (
                  taxGroups.map((group) => (
                    <Table.Row key={group.id}>
                      <Table.Cell>{group.id}</Table.Cell>
                      <Table.Cell className="font-medium">{group.name}</Table.Cell>
                      <Table.Cell>
                        {group.taxes
                          .map((t) => taxMap.get(t.taxId))
                          .filter(Boolean)
                          .join(", ") || "-"}
                      </Table.Cell>
                      <Table.Cell className="text-end">
                        <ActionDropdown
                          deleteAction={deleteTaxGroup}
                          deleteId={group.id}
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
                <Link href={`/master/kelompok-pajak?halaman=${page - 1}&search=${params.cari || ""}`} className="button button--ghost button--sm">← Prev</Link>
              )}
              {page < totalPages && (
                <Link href={`/master/kelompok-pajak?halaman=${page + 1}&search=${params.cari || ""}`} className="button button--ghost button--sm">Next →</Link>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
