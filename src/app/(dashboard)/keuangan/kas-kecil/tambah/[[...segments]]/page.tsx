export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { loadPostableAccounts } from "@/lib/finance/postable-accounts"
import { requirePermission } from "@/lib/auth/permissions"
import { PettyCashForm } from "@/components/forms/petty-cash-form"
import { PageHeader } from "@/components/ui/page-header"
import { parsePrefillSegments } from "@/lib/utils/prefill-path"
import { redirect } from "next/navigation"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Tambah Kas Kecil" }

export default async function CreatePettyCashPage({
  params: routeParams,
  searchParams,
}: {
  params: Promise<{ segments?: string[] }>
  searchParams: Promise<{ tipe?: string }>
}) {
  await requirePermission("create_petty_cash")
  const params = await searchParams
  const { segments } = await routeParams
  const seg = parsePrefillSegments(segments, ["tipe"])

  // Tautan lama `?tipe=OUT` / `?tipe=IN` dialihkan secara konsisten ke format path
  if (!seg.tipe && params.tipe) {
    const raw = params.tipe.toLowerCase()
    redirect(raw === "in" || raw === "out" ? `/keuangan/kas-kecil/tambah/tipe/${raw}` : "/keuangan/kas-kecil/tambah")
  }

  const rawTipe = (seg.tipe ?? params.tipe ?? "").toUpperCase()
  const defaultType = rawTipe === "OUT" ? "OUT" : rawTipe === "IN" ? "IN" : undefined

  const [accounts, projects, vendors, categories, lastRecord] = await Promise.all([
    loadPostableAccounts(),
    prisma.project.findMany({
      where: { status: "active" },
      orderBy: { name: "asc" },
      select: { id: true, name: true, documentNo: true },
    }),
    prisma.vendor.findMany({
      where: { deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.expenseCategory.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
      select: { id: true, name: true, label: true },
    }),
    prisma.pettyCash.findFirst({
      where: { status: "posted", deletedAt: null },
      orderBy: [{ date: "desc" }, { id: "desc" }],
      select: { balanceAfter: true },
    }),
  ])

  const currentBalance = lastRecord ? Number(lastRecord.balanceAfter) : 0

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={defaultType === "IN" ? "Isi Kas Kecil (Reimposisi)" : "Buat Voucher Kas Kecil (PCV)"}
        subtitle={
          defaultType === "IN"
            ? "Pengisian kembali saldo fisik kas kecil dari rekening Kas/Bank Utama ke kasir kas kecil."
            : "Pencatatan voucher kas operasional harian beserta nota fisik dan alokasi beban."
        }
        breadcrumbs={[
          { label: "Dasbor", href: "/" },
          { label: "Keuangan", href: "/keuangan" },
          { label: "Kas Kecil", href: "/keuangan/kas-kecil" },
          { label: defaultType === "IN" ? "Pengisian" : "Tambah Transaksi" },
        ]}
      />
      <PettyCashForm
        accounts={accounts}
        projects={projects}
        vendors={vendors}
        categories={categories}
        currentBalance={currentBalance}
        defaultType={defaultType}
      />
    </div>
  )
}
