"use client"

import { useState } from "react"
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react"
import { format } from "date-fns"
import { id as idLocale } from "date-fns/locale"

import { Label } from "@/components/ui/shadcn/label"
import { Button } from "@/components/ui/shadcn/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/shadcn/popover"
import { cn } from "@/lib/utils"

interface AppMonthPickerProps {
  label?: string
  name: string
  /** Nilai "YYYY-MM". */
  value?: string
  /** Nilai awal "YYYY-MM" (mode tak terkendali). */
  defaultValue?: string
  onChange?: (monthStr: string) => void
  required?: boolean
  disabled?: boolean
  placeholder?: string
  className?: string
}

const MONTH_VALUE = /^\d{4}-(0[1-9]|1[0-2])$/

/** "YYYY-MM" yang valid, atau "" bila kosong/rusak. */
function normalizeMonth(monthValue?: string): string {
  if (!monthValue) return ""
  const v = String(monthValue).slice(0, 7)
  return MONTH_VALUE.test(v) ? v : ""
}

function parseMonth(v: string): { year: number; month: number } | null {
  if (!MONTH_VALUE.test(v)) return null
  const [year, month] = v.split("-").map(Number)
  return { year, month }
}

function monthLabel(v: string): string {
  const parsed = parseMonth(v)
  if (!parsed) return ""
  return format(new Date(parsed.year, parsed.month - 1, 1), "MMMM yyyy", { locale: idLocale })
}

/**
 * Pemilih bulan senada `AppDatePicker`: Popover berisi kisi 12 bulan +
 * navigasi tahun, nilai dikirim sebagai string "YYYY-MM" lewat input
 * tersembunyi (kontrak FormData sama seperti `<input type="month">`).
 * Pada field opsional (`required` tak diisi), mengklik bulan yang sudah
 * terpilih mengosongkan nilai — pengganti tombol hapus yang tak dimiliki
 * pemilih kalender.
 */
export function AppMonthPicker({
  label,
  name,
  value,
  defaultValue,
  onChange,
  required,
  disabled,
  placeholder = "Pilih bulan",
  className,
}: AppMonthPickerProps) {
  const isControlled = value !== undefined
  const [internal, setInternal] = useState<string>(normalizeMonth(defaultValue))
  const [open, setOpen] = useState(false)
  const current = isControlled ? normalizeMonth(value) : internal
  const selected = parseMonth(current)
  const [viewYear, setViewYear] = useState<number>(
    () => selected?.year ?? new Date().getFullYear(),
  )

  function emit(next: string) {
    if (!isControlled) setInternal(next)
    onChange?.(next)
  }

  function handlePick(month: number) {
    const next = `${viewYear}-${String(month).padStart(2, "0")}`
    emit(!required && next === current ? "" : next)
    setOpen(false)
  }

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {label && (
        <Label htmlFor={`${name}-trigger`} className="text-sm font-medium text-foreground">
          {label}
        </Label>
      )}
      <input type="hidden" name={name} value={current} disabled={disabled} />
      <Popover
        open={open}
        onOpenChange={(nextOpen) => {
          setOpen(nextOpen)
          if (nextOpen) setViewYear(selected?.year ?? new Date().getFullYear())
        }}
      >
        <PopoverTrigger asChild>
          <Button
            id={`${name}-trigger`}
            type="button"
            variant="outline"
            disabled={disabled}
            aria-required={required}
            className={cn(
              "h-10 w-full justify-start gap-2 px-3 font-normal",
              !current && "text-muted-foreground",
            )}
          >
            <CalendarDays className="size-4 opacity-70" aria-hidden="true" />
            {current ? monthLabel(current) : placeholder}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-64 p-3" align="start">
          <div className="flex items-center justify-between pb-2">
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="size-7"
              aria-label="Tahun sebelumnya"
              onClick={() => setViewYear((y) => y - 1)}
            >
              <ChevronLeft className="size-4" aria-hidden="true" />
            </Button>
            <span className="text-sm font-medium" aria-live="polite">
              {viewYear}
            </span>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="size-7"
              aria-label="Tahun berikutnya"
              onClick={() => setViewYear((y) => y + 1)}
            >
              <ChevronRight className="size-4" aria-hidden="true" />
            </Button>
          </div>
          <div className="grid grid-cols-3 gap-1.5" role="listbox" aria-label={`Bulan tahun ${viewYear}`}>
            {Array.from({ length: 12 }, (_, i) => i + 1).map((month) => {
              const isSelected = selected?.year === viewYear && selected?.month === month
              return (
                <button
                  key={month}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => handlePick(month)}
                  className={cn(
                    "h-9 rounded-md text-sm",
                    isSelected
                      ? "bg-primary font-medium text-primary-foreground"
                      : "hover:bg-accent hover:text-accent-foreground",
                  )}
                >
                  {format(new Date(viewYear, month - 1, 1), "MMM", { locale: idLocale })}
                </button>
              )
            })}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}
