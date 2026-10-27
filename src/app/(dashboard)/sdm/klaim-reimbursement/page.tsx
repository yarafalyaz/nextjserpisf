export const dynamic = "force-dynamic"

import Link from "next/link"
import { requirePermission } from "@/lib/auth/permissions"
import { getMyReimbursementClaims } from "@/actions/reimbursement.actions"
import { CanCreate } from "@/components/auth/can-create"
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
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">Klaim Reimbursement Saya</h1>
        <CanCreate permission="create_employee_reimbursements">
          <Link
            href="/sdm/klaim-reimbursement/tambah"
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all"
            id="create-reimbursement-claim-btn"
          >
            + Ajukan Klaim
          </Link>
        </CanCreate>
      </div>

      {data.length === 0 ? (
        <div className="rounded-xl border border-default bg-surface p-6 text-sm text-muted-foreground">
          Belum ada klaim reimbursement. Gunakan tombol Ajukan Klaim untuk membuat klaim pertama.
        </div>
      ) : (
        <MyReimbursementClaimsTable data={data} />
      )}

      <p className="text-sm text-muted-foreground">
        Mengelola klaim disetujui yang menunggu pembayaran?{" "}
        <Link
          href="/keuangan/antrean-reimbursement"
          className="inline-flex min-h-11 items-center font-medium text-primary hover:underline sm:min-h-9"
        >
          Antrean Reimbursement
        </Link>
      </p>
    </div>
  )
}
