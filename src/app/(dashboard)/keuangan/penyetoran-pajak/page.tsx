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
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Penyetoran Pajak</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Setoran pajak yang sudah dipotong ke kas negara. Jurnalnya mengurai utang pajak
            (Dr utang pajak, Cr kas/bank) — bukan menambah beban.
          </p>
        </div>
        <CanCreate permission="create_tax_payments">
          <Link
            href="/keuangan/penyetoran-pajak/tambah"
            className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-all hover:bg-primary-hover"
            id="create-tax-payment-btn"
          >
            + Tambah Setoran
          </Link>
        </CanCreate>
      </div>

      <TaxPaymentTable data={rows} />
    </div>
  )
}
