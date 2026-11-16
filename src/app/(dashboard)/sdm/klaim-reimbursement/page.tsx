export const dynamic = "force-dynamic"

import Link from "next/link"
import { Plus } from "@/components/ui/fontawesome-icons"
import { requirePermission } from "@/lib/auth/permissions"
import { getMyReimbursementClaims } from "@/actions/reimbursement.actions"
import { CanCreate } from "@/components/auth/can-create"
import { EmptyState } from "@/components/ui/empty-state"
import { PageHeader } from "@/components/ui/page-header"
import { MyReimbursementClaimsTable } from "./_components/my-reimbursement-claims-table"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Klaim Reimbursement" }

export default async function MyReimbursementClaimsPage() {
  await requirePermission("create_employee_reimbursements")

  const result = await getMyReimbursementClaims()
  if (!result.success) {
    throw new Error(result.error || "Gagal memuat klaim reimbursement")
  }
  const data = result.data.map((claim) => ({
    ...claim,
    date: claim.date instanceof Date ? claim.date.toISOString() : claim.date,
  }))

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Klaim Reimbursement Saya"
        subtitle="Pengajuan penggantian biaya operasional staf, unggah nota/bukti bayar, dan status persetujuan keuangan."
        breadcrumbs={[
          { label: "Dasbor", href: "/" },
          { label: "SDM", href: "/sdm" },
          { label: "Klaim Reimbursement" },
        ]}
        actions={
          <CanCreate permission="create_employee_reimbursements">
            <Link
              href="/sdm/klaim-reimbursement/tambah"
              className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 min-h-11 sm:min-h-9 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-2xs cursor-pointer"
              id="create-reimbursement-claim-btn"
            >
              <Plus className="size-3.5" aria-hidden="true" />
              <span>Ajukan Klaim</span>
            </Link>
          </CanCreate>
        }
      />

      {data.length === 0 ? (
        <EmptyState title="Belum ada klaim reimbursement." description="Gunakan tombol Ajukan Klaim untuk membuat klaim pertama." />
      ) : (
        <MyReimbursementClaimsTable data={data} />
      )}

      <p className="text-sm text-muted-foreground">
        Mengelola klaim disetujui yang menunggu pembayaran?{" "}
        <Link
          href="/keuangan/antrean-reimbursement"
          className="inline-flex min-h-11 items-center font-medium text-primary hover:underline sm:min-h-9"
        >
          Pencairan Klaim Karyawan
        </Link>
      </p>
    </div>
  )
}
