'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { toLocalDateOnly } from '@/lib/utils/date-only'

const presets = [
  { label: 'Bulan Ini', key: 'this-month' },
  { label: 'Bulan Lalu', key: 'last-month' },
  { label: 'Kuartal Ini', key: 'this-quarter' },
  { label: 'Tahun Ini', key: 'ytd' },
  { label: 'Tahun Lalu', key: 'last-year' },
]

function getPresetDates(key: string): { startDate: string; endDate: string } {
  const now = new Date()
  const y = now.getFullYear()
  const m = now.getMonth()

  // Every value is a LOCAL calendar day. Deriving them with
  // `toISOString().split('T')[0]` reported the PREVIOUS day under
  // TZ=Asia/Jakarta (local midnight = 17:00 UTC the day before), so "Bulan Ini"
  // in September started 31 Aug and "today" was wrong before 07:00 WIB.
  const today = toLocalDateOnly(now)

  switch (key) {
    case 'this-month':
      return {
        startDate: toLocalDateOnly(new Date(y, m, 1)),
        endDate: today,
      }
    case 'last-month':
      return {
        startDate: toLocalDateOnly(new Date(y, m - 1, 1)),
        endDate: toLocalDateOnly(new Date(y, m, 0)),
      }
    case 'this-quarter': {
      const qStart = Math.floor(m / 3) * 3
      return {
        startDate: toLocalDateOnly(new Date(y, qStart, 1)),
        endDate: today,
      }
    }
    case 'ytd':
      return {
        startDate: toLocalDateOnly(new Date(y, 0, 1)),
        endDate: today,
      }
    case 'last-year':
      return {
        startDate: toLocalDateOnly(new Date(y - 1, 0, 1)),
        endDate: toLocalDateOnly(new Date(y - 1, 11, 31)),
      }
    default:
      return {
        startDate: toLocalDateOnly(new Date(y, 0, 1)),
        endDate: today,
      }
  }
}

export function DatePresets() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const handlePreset = (key: string) => {
    const { startDate, endDate } = getPresetDates(key)
    const params = new URLSearchParams(searchParams.toString())
    params.set('tanggalMulai', startDate)
    params.set('tanggalSelesai', endDate)
    router.push(`?${params.toString()}`)
  }

  return (
    <div
      role="group"
      aria-label="Rentang waktu cepat"
      className="flex items-center gap-1.5 flex-wrap print:hidden"
    >
      {presets.map((p) => (
        <Button
          key={p.key}
          type="button"
          onClick={() => handlePreset(p.key)}
          aria-label={`Atur rentang ke ${p.label}`}
          variant="secondary"
          size="sm"
          className="h-7 text-xs px-2.5"
        >
          {p.label}
        </Button>
      ))}
    </div>
  )
}
