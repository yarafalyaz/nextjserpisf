import Link from "next/link"
import { formatDate } from "@/lib/utils/format"
import type { EmployeeLifecycleAttentionRow } from "@/lib/reports/employee-lifecycle"

/**
 * F-2026-10-22-085-S: daftar perhatian siklus hidup karyawan.
 * Murni presentasi: label/kind/status dari read-model server apa adanya,
 * TIDAK menghitung status/tanggal dan TIDAK memuat nominal gaji (BR-EMP-07/08).
 */
export function EmployeeLifecycleAttentionCard({
  rows,
  error,
}: {
  rows: EmployeeLifecycleAttentionRow[]
  error?: string | null
}) {
  return (
    <section aria-labelledby="perhatian-siklus-hidup-heading" className="rounded-xl border border-default bg-surface shadow-sm overflow-hidden">
      <div className="border-b border-default p-4 px-5">
        <h2 id="perhatian-siklus-hidup-heading" className="text-[0.9375rem] font-semibold text-foreground">
          Perhatian Siklus Hidup Karyawan
        </h2>
      </div>
      <div className="p-4 px-5">
        {error ? (
          <p role="alert" className="text-sm text-danger">{error}</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">Tidak ada karyawan yang memerlukan perhatian siklus hidup.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm" aria-label="Daftar perhatian siklus hidup karyawan">
              <thead>
                <tr className="border-b border-default text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th scope="col" className="py-2 pr-4 font-medium">Karyawan</th>
                  <th scope="col" className="py-2 pr-4 font-medium">Perhatian</th>
                  <th scope="col" className="py-2 pr-4 font-medium">Status Kepegawaian</th>
                  <th scope="col" className="py-2 pr-4 font-medium">Tanggal Akhir Kontrak</th>
                  <th scope="col" className="py-2 pr-4 font-medium">Tanggal Berhenti Bekerja</th>
                  <th scope="col" className="py-2 font-medium">Alasan Berhenti</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={`${row.employeeId}-${row.kind}`} className="border-b border-default last:border-0">
                    <td className="py-2 pr-4">
                      <Link href={`/master/karyawan/${row.employeeId}`} className="font-medium text-foreground hover:underline">
                        {row.name}
                      </Link>
                    </td>
                    <td className="py-2 pr-4">{row.label}</td>
                    <td className="py-2 pr-4">{row.employmentStatusLabel}</td>
                    <td className="py-2 pr-4">{row.contractEndDate ? formatDate(row.contractEndDate) : "-"}</td>
                    <td className="py-2 pr-4">{row.employmentEndedAt ? formatDate(row.employmentEndedAt) : "-"}</td>
                    <td className="py-2">{row.endReasonLabel ?? "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  )
}
