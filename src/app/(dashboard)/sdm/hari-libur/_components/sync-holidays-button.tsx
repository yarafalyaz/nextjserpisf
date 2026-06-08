"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { RefreshCw } from "lucide-react"
import { syncNationalHolidays } from "@/actions/hrm.actions"
import { showSuccess, showError } from "@/lib/utils/toast"
import { Button } from "@/components/ui/shadcn/button"
import { Combobox } from "@/components/ui/combobox"

export function SyncHolidaysButton() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const currentYear = new Date().getFullYear()
  const [year, setYear] = useState(String(currentYear))

  const years = [currentYear - 1, currentYear, currentYear + 1].map(String)

  function handleSync() {
    startTransition(async () => {
      const res = await syncNationalHolidays(Number(year))
      if (res?.success && "created" in res) {
        showSuccess(
          `Sinkronisasi ${year} selesai`,
          `${res.created} libur baru ditambahkan, ${res.skipped} sudah ada.`
        )
        router.refresh()
      } else {
        showError((res && "error" in res && res.error) || "Gagal sinkronisasi libur nasional")
      }
    })
  }

  return (
    <div className="flex items-center gap-2">
      <Combobox
        value={year}
        onChange={(key) => setYear(key ?? String(currentYear))}
        disabled={isPending}
        options={years.map((y) => ({ value: y, label: y }))}
        placeholder="Tahun"
        className="w-[110px]"
      />
      <Button variant="outline" onClick={handleSync} disabled={isPending}>
        <RefreshCw className={isPending ? "size-4 animate-spin" : "size-4"} />
        {isPending ? "Menyinkronkan..." : "Sinkron Libur Nasional"}
      </Button>
    </div>
  )
}
