"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { Combobox } from "@/components/ui/combobox"

/**
 * Pemilih departemen laporan saldo cuti (AC-LVB-F1). Hanya dirender halaman
 * untuk scope `all`; memilih departemen menavigasi ke segmen
 * `departemen/<id>` pada tahun aktif, mempertahankan `?cari=`.
 */
export function LeaveBalanceDepartmentFilter({
  year,
  departmentId,
  departments,
}: {
  year: number
  departmentId: number | null
  departments: { id: number; name: string }[]
}) {
  const router = useRouter()
  const searchParams = useSearchParams()

  function handleChange(value: string | null) {
    const segments = [`/sdm/cuti/saldo/tahun/${year}`]
    if (value) segments.push("departemen", value)
    const cari = searchParams.get("cari")
    router.push(cari ? `${segments.join("/")}?cari=${encodeURIComponent(cari)}` : segments.join("/"))
  }

  return (
    <div className="flex flex-col gap-1.5 w-full sm:w-[260px]">
      <label htmlFor="filter-departemen-saldo-cuti" className="text-sm font-medium text-foreground">
        Departemen
      </label>
      <Combobox
        id="filter-departemen-saldo-cuti"
        options={departments.map((d) => ({ value: String(d.id), label: d.name }))}
        value={departmentId ? String(departmentId) : null}
        onChange={handleChange}
        placeholder="Semua departemen"
      />
    </div>
  )
}
