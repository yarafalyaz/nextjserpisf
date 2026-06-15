'use client'

import { useRouter, useSearchParams } from 'next/navigation'

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

  switch (key) {
    case 'this-month':
      return {
        startDate: new Date(y, m, 1).toISOString().split('T')[0],
        endDate: now.toISOString().split('T')[0],
      }
    case 'last-month':
      return {
        startDate: new Date(y, m - 1, 1).toISOString().split('T')[0],
        endDate: new Date(y, m, 0).toISOString().split('T')[0],
      }
    case 'this-quarter': {
      const qStart = Math.floor(m / 3) * 3
      return {
        startDate: new Date(y, qStart, 1).toISOString().split('T')[0],
        endDate: now.toISOString().split('T')[0],
      }
    }
    case 'ytd':
      return {
        startDate: new Date(y, 0, 1).toISOString().split('T')[0],
        endDate: now.toISOString().split('T')[0],
      }
    case 'last-year':
      return {
        startDate: new Date(y - 1, 0, 1).toISOString().split('T')[0],
        endDate: new Date(y - 1, 11, 31).toISOString().split('T')[0],
      }
    default:
      return {
        startDate: new Date(y, 0, 1).toISOString().split('T')[0],
        endDate: now.toISOString().split('T')[0],
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
        <button
          key={p.key}
          type="button"
          onClick={() => handlePreset(p.key)}
          aria-label={`Atur rentang ke ${p.label}`}
          className="px-2.5 py-1 text-xs font-medium rounded-md border border-default bg-surface hover:bg-default/50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
        >
          {p.label}
        </button>
      ))}
    </div>
  )
}
