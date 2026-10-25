export const dynamic = "force-dynamic"

import { requireAuth } from "@/lib/auth/permissions"
import { loadOwnPayslips } from "@/lib/reports/payslip-self-data"
import { OwnPayslipTable } from "./_components/own-payslip-table"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Slip Gaji Saya" }

export default async function OwnPayslipsPage() {
  // Gerbang halaman = login terautentikasi saja (tanpa permission key baru;
  // loader fail-closed sendiri via getHrScope). Baca angka/label apa adanya.
  const user = await requireAuth()
  const data = await loadOwnPayslips({ id: user.id, roles: user.roles })

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">Slip Gaji Saya</h1>
      </div>

      {data.length === 0 ? (
        <div className="rounded-xl border border-default bg-surface p-6 text-sm text-muted-foreground">
          Belum ada slip gaji final. Slip tampil di sini sesudah penggajian disetujui atau
          dibayar oleh SDM.
        </div>
      ) : (
        <OwnPayslipTable data={data} />
      )}
    </div>
  )
}
