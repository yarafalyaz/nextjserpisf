export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { notFound } from "next/navigation"
import { requirePermission } from "@/lib/auth/permissions"
import { resolveEntity } from "@/lib/utils/resolve-entity"
import { PageHeader } from "@/components/ui/page-header"
import { FormCard } from "@/components/ui/form-section"
import { BankStatementLineForm } from "../../../_components/bank-statement-line-form"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Ubah Baris Rekening Koran" }

/**
 * `BankStatementLine.date` disimpan sebagai TENGAH MALAM UTC hari kalender WIB
 * (aksinya memakai `wibDateToUtcMidnight`), jadi komponen UTC nilai ini memang
 * tanggal WIB-nya — nilai untuk `AppDatePicker` tanpa digeser zona waktu.
 */
function dateInputValue(date: Date): string {
  return date.toISOString().slice(0, 10)
}

export default async function EditBankStatementLinePage({
  params,
}: {
  params: Promise<{ slug: string; lineId: string }>
}) {
  await requirePermission("create_journals")
  const { slug, lineId: lineIdParam } = await params
  const lineId = Number(lineIdParam)
  if (!Number.isInteger(lineId) || lineId <= 0) notFound()

  const stmt = await resolveEntity(
    { segment: slug, fallbackWhere: { deletedAt: null } },
    {
      bySlug: (s, where) =>
        prisma.bankStatement.findFirst({ where: { slug: s, ...where }, include: { lines: true } }),
      byId: (id, where) =>
        prisma.bankStatement.findFirst({ where: { id, ...where }, include: { lines: true } }),
    },
  )
  if (!stmt) notFound()

  // Target ubah dibatasi pada baris rekening koran INI: id milik dokumen lain
  // di URL tidak boleh membuka formulirnya di sini (aksinya tetap menolak,
  // tetapi halaman yang menampilkan data dokumen lain itu sendiri keliru).
  const line = stmt.lines.find((l) => l.id === lineId)
  if (!line) notFound()

  const baseHref = `/keuangan/laporan-bank/${encodeURIComponent(slug)}`
  const item = {
    id: line.id,
    date: dateInputValue(line.date),
    description: line.description ?? "",
    amount: Number(line.amount),
    type: line.type,
    reference: line.reference ?? "",
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Ubah Baris Rekening Koran"
        subtitle={`Rekening koran #${stmt.id}.`}
        breadcrumbs={[
          { label: "Dasbor", href: "/" },
          { label: "Keuangan", href: "/keuangan" },
          { label: "Laporan Bank", href: "/keuangan/laporan-bank" },
          { label: "Detail", href: baseHref },
          { label: "Ubah Baris" },
        ]}
      />
      <FormCard>
        <BankStatementLineForm key={item.id} bankStatementId={stmt.id} baseHref={baseHref} line={item} />
      </FormCard>
    </div>
  )
}
