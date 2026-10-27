export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import Link from "next/link"
import { entityEditHref } from "@/lib/utils/entity-url"
import { EmptyState } from "@/components/ui/empty-state"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { DetailTable, DetailTableHead, DetailTableTh, DetailTableBody, DetailTableRow, DetailTableTd } from "@/components/ui/detail-table"
import { StatusChip } from "@/components/ui/status-chip"
import { CanCreate } from "@/components/auth/can-create"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Jenis PPh" }

export default async function WithholdingTaxTypesPage() {
  await requirePermission("manage_withholding_tax")

  const types = await prisma.withholdingTaxType.findMany({
    where: { deletedAt: null },
    orderBy: { code: "asc" },
  })

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
        { label: "Dasbor", href: "/" },
        { label: "Pengaturan", href: "/pengaturan" },
        { label: "Jenis PPh" },
      ]} />

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground sm:text-2xl">Jenis Pemotongan PPh</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Tarif dan akun hutang pajak yang dipakai saat memotong PPh pada tagihan pemasok.
          </p>
        </div>
        <CanCreate permission="manage_withholding_tax">
          <Link href="/pengaturan/pajak-potong/tambah" className="inline-flex items-center justify-center gap-1.5 w-full sm:w-auto px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary-hover transition-all" id="create-withholding-tax-btn">
            + Tambah Jenis PPh
          </Link>
        </CanCreate>
      </div>

      <DetailTable data-report-table="Jenis PPh">
        <DetailTableHead>
          <DetailTableTh>Kode</DetailTableTh>
          <DetailTableTh>Nama</DetailTableTh>
          <DetailTableTh align="right">Tarif</DetailTableTh>
          <DetailTableTh>Status</DetailTableTh>
          <DetailTableTh align="right">Aksi</DetailTableTh>
        </DetailTableHead>
        <DetailTableBody>
          {types.map((type) => (
            <DetailTableRow key={type.id}>
              <DetailTableTd className="font-mono">{type.code}</DetailTableTd>
              <DetailTableTd>{type.name}</DetailTableTd>
              <DetailTableTd align="right">{Number(type.rate).toLocaleString("id-ID")}%</DetailTableTd>
              <DetailTableTd><StatusChip status={type.isActive ? "active" : "inactive"} /></DetailTableTd>
              <DetailTableTd align="right">
                <Link href={entityEditHref("/pengaturan/pajak-potong", type)} className="text-primary hover:underline text-sm">
                  Ubah
                </Link>
              </DetailTableTd>
            </DetailTableRow>
          ))}
          {types.length === 0 && (
            <DetailTableRow>
              <DetailTableTd colSpan={5} className="py-6">
                <EmptyState title="Belum ada jenis PPh" description="Tambahkan agar pemotongan PPh pada tagihan pemasok bisa dijurnal." className="py-0" />
              </DetailTableTd>
            </DetailTableRow>
          )}
        </DetailTableBody>
      </DetailTable>
    </div>
  )
}
