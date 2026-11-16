"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { useState } from "react"
import Link from "next/link"
import { FormSelect } from "@/components/ui/form-select"
import { Button } from "@/components/ui/button"
import { buildPathFilterHref } from "@/lib/utils/path-filters"

/**
 * Filter bulan/tahun daftar penggajian. Keduanya hidup di PATH sebagai
 * pasangan kunci/nilai (`/sdm/penggajian/tahun/2026/bulan/5`, pola yang
 * sama dengan filter absensi); mendukung filter tahun saja, bulan saja, atau keduanya.
 */
export function PayrollFilterForm({
  bulan,
  tahun,
  status,
}: {
  bulan?: string
  tahun?: string
  status?: string
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [bulanValue, setBulanValue] = useState(bulan ?? "")
  const [tahunValue, setTahunValue] = useState(tahun ?? "")

  const preservedQuery = (() => {
    const sp = new URLSearchParams()
    const cari = searchParams.get("cari")
    const pageSize = searchParams.get("pageSize")
    if (cari) sp.set("cari", cari)
    if (pageSize) sp.set("pageSize", pageSize)
    return sp.toString()
  })()

  function onSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault()
    const path = buildPathFilterHref("/sdm/penggajian", {
      tahun: tahunValue || undefined,
      bulan: bulanValue || undefined,
      status: status || undefined,
    })
    router.push(preservedQuery ? `${path}?${preservedQuery}` : path)
  }

  return (
    <div className="flex gap-2 flex-wrap items-center">
      <form onSubmit={onSubmit} className="flex gap-2 flex-wrap" aria-label="Filter bulan penggajian">
        <FormSelect
          name="bulan"
          value={bulanValue}
          onValueChange={setBulanValue}
          placeholder="Bulan"
          className="min-w-[140px]"
          options={[
            { value: "", label: "Semua Bulan" },
            ...[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((m) => ({
              value: String(m),
              label: new Date(2026, m - 1).toLocaleString("id-ID", { month: "long" }),
            })),
          ]}
        />
        <FormSelect
          name="tahun"
          value={tahunValue}
          onValueChange={setTahunValue}
          placeholder="Tahun"
          className="min-w-[110px]"
          options={[
            { value: "", label: "Semua Tahun" },
            ...[2025, 2026, 2027].map((y) => ({ value: String(y), label: String(y) })),
          ]}
        />
        <Button type="submit">Saring</Button>
      </form>
      {(bulan || tahun) && (
        <Link
          href={
            preservedQuery
              ? `${status ? `/sdm/penggajian/status/${status}` : "/sdm/penggajian"}?${preservedQuery}`
              : status
                ? `/sdm/penggajian/status/${status}`
                : "/sdm/penggajian"
          }
          className="text-xs text-primary hover:underline"
        >
          Atur ulang bulan
        </Link>
      )}
    </div>
  )
}
