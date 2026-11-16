export const dynamic = "force-dynamic"

import { requireAuth } from "@/lib/auth/permissions"
import { loadOwnPayslips } from "@/lib/reports/payslip-self-data"
import { EmptyState } from "@/components/ui/empty-state"
import { PageHeader } from "@/components/ui/page-header"
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
      <PageHeader
        title="Slip Gaji Saya"
        breadcrumbs={[
          { label: "Dasbor", href: "/" },
          { label: "SDM", href: "/sdm" },
          { label: "Slip Gaji Saya" },
        ]}
      />

      {data.length === 0 ? (
        <EmptyState title="Belum ada slip gaji final." description="Slip tampil di sini sesudah penggajian disetujui atau dibayar oleh SDM." />
      ) : (
        <OwnPayslipTable data={data} />
      )}
    </div>
  )
}
