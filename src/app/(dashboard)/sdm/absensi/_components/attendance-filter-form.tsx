"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"
import Link from "next/link"
import { AppDatePicker } from "@/components/ui/date-picker"
import { AppMonthPicker } from "@/components/ui/month-picker"
import { Button } from "@/components/ui/button"

/**
 * Filter tanggal/bulan daftar absensi. Tanggal & bulan hidup di PATH
 * (`/sdm/absensi/tanggal/2026-09-30` atau `/sdm/absensi/bulan/2026-02`,
 * pola kunci/nilai yang sama dengan filter laporan), sedangkan status &
 * pencarian tetap query string sesuai konvensi halaman daftar. Memilih
 * tanggal membuang bulan dan sebaliknya — keduanya tak pernah dikirim
 * bersamaan seperti pada form GET lama.
 */
export function AttendanceFilterForm({
  tanggal,
  bulan,
  status,
  cari,
}: {
  tanggal?: string
  bulan?: string
  status?: string
  cari?: string
}) {
  const router = useRouter()
  const [tanggalValue, setTanggalValue] = useState(tanggal ?? "")
  const [bulanValue, setBulanValue] = useState(bulan ?? "")

  function onSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault()
    let path = "/sdm/absensi"
    if (tanggalValue) path += `/tanggal/${tanggalValue}`
    else if (bulanValue) path += `/bulan/${bulanValue}`
    const query = new URLSearchParams()
    if (status) query.set("status", status)
    if (cari) query.set("cari", cari)
    const qs = query.toString()
    router.push(qs ? `${path}?${qs}` : path)
  }

  return (
    <form
      onSubmit={onSubmit}
      aria-label="Filter absensi"
      className="flex flex-wrap items-end gap-3"
    >
      <AppDatePicker
        label="Tanggal"
        name="tanggal"
        value={tanggalValue}
        onChange={(v) => {
          setTanggalValue(v)
          if (v) setBulanValue("")
        }}
        className="w-44"
      />
      <AppMonthPicker
        label="Bulan"
        name="bulan"
        value={bulanValue}
        onChange={(v) => {
          setBulanValue(v)
          if (v) setTanggalValue("")
        }}
        className="w-40"
      />
      <Button type="submit" variant="primary">
        Terapkan
      </Button>
      <Link href="/sdm/absensi" className="text-sm text-primary hover:underline pb-2.5">
        Atur ulang filter
      </Link>
    </form>
  )
}
