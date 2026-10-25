export const dynamic = "force-dynamic"

import type { Metadata } from "next"

import { requirePermission, hasPermission } from "@/lib/auth/permissions"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { DownPaymentTaxStatusPanel } from "@/app/(dashboard)/keuangan/dokumen-pajak/_components/down-payment-tax-status-panel"
import { loadDownPaymentTaxStatusRows } from "@/lib/reports/down-payment-tax-status-data"
import { toPlain } from "@/lib/utils/serialization"

export const metadata: Metadata = { title: "Status Pajak Uang Muka" }

/**
 * Antrean FP uang muka (F-2026-10-25-004-V konsumen PR #785 merged).
 *
 * Baca = `view_tax_payments` (penyetoran pajak); form terbit hanya tampil
 * bagi pemegang `create_tax_invoices` — action server menegakkan izin yang
 * sama. Semua angka/label dari loader server verbatim, nol hitung di UI.
 */
export default async function DownPaymentTaxStatusPage() {
  await requirePermission("view_tax_payments")

  const [rows, canIssue] = await Promise.all([
    loadDownPaymentTaxStatusRows({ confirmedOnly: true }),
    hasPermission("create_tax_invoices"),
  ])

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs
        items={[
          { label: "Dasbor", href: "/" },
          { label: "Keuangan", href: "/keuangan" },
          { label: "Dokumen Pajak", href: "/keuangan/dokumen-pajak/faktur/tambah" },
          { label: "Status Pajak Uang Muka" },
        ]}
      />
      <h1 className="text-2xl font-bold text-foreground">Status Pajak Uang Muka</h1>
      <DownPaymentTaxStatusPanel rows={toPlain(rows)} canIssue={canIssue} />
    </div>
  )
}
