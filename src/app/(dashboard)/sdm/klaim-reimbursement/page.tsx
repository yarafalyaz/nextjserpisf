export const dynamic = "force-dynamic"

import Link from "next/link"
import { Plus } from "@/components/ui/fontawesome-icons"
import { requirePermission } from "@/lib/auth/permissions"
import { getMyReimbursementClaims } from "@/actions/reimbursement.actions"
import { CanCreate } from "@/components/auth/can-create"
import { EmptyState } from "@/components/ui/empty-state"
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
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between pb-2 border-b border-border">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground text-balance">
            Klaim Reimbursement Saya
          </h1>
          <p className="mt-0.5 text-xs text-muted-foreground text-pretty">
            Pengajuan penggantian biaya operasional staf, unggah nota/bukti bayar, dan status persetujuan keuangan.
          </p>
        </div>
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
      </div>

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
