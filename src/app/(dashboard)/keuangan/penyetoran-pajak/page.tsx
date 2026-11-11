import { Plus } from "@/components/ui/fontawesome-icons";
export const dynamic = "force-dynamic"

import Link from "next/link"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { CanCreate } from "@/components/auth/can-create"
import { TaxPaymentTable } from "./_components/tax-payment-table"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Penyetoran Pajak" }

export default async function TaxPaymentsPage() {
  await requirePermission("view_tax_payments")

  const payments = await prisma.taxPayment.findMany({
    where: { deletedAt: null },
    orderBy: { date: "desc" },
    take: 200,
    include: { taxType: { select: { name: true } } },
  })

  const rows = payments.map((payment) => ({
    id: payment.id,
    documentNo: payment.documentNo,
    date: payment.date.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" }),
    period: payment.period,
    typeLabel: payment.taxType?.name ?? "Pajak",
    reference: payment.reference,
    amount: Number(payment.amount),
    journalId: payment.journalId,
  }))

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs
        items={[
          { label: "Dasbor", href: "/" },
          { label: "Keuangan", href: "/keuangan" },
          { label: "Penyetoran Pajak" },
        ]}
      />
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between pb-2 border-b border-border">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground text-balance">Penyetoran Pajak</h1>
          <p className="mt-0.5 text-xs text-muted-foreground text-pretty">
            Setoran pajak yang sudah dipotong ke kas negara. Jurnalnya mengurai utang pajak
            (Dr utang pajak, Cr kas/bank): bukan menambah beban baru.
          </p>
        </div>
        <CanCreate permission="create_tax_payments">
          <Link
            href="/keuangan/penyetoran-pajak/tambah"
            className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 min-h-11 sm:min-h-9 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-2xs cursor-pointer"
            id="create-tax-payment-btn"
          >
            <Plus className="size-3.5" aria-hidden="true" />
            <span>Tambah Setoran</span>
          </Link>
        </CanCreate>
      </div>

      <TaxPaymentTable data={rows} />
    </div>
  )
}
