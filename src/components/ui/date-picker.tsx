"use client"

import { useState } from "react"
import { CalendarIcon } from "lucide-react"
import { format } from "date-fns"
import { id as idLocale } from "date-fns/locale"

import { Label } from "@/components/ui/shadcn/label"
import { Button } from "@/components/ui/shadcn/button"
import { Calendar } from "@/components/ui/shadcn/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/shadcn/popover"
import { cn } from "@/lib/utils"

interface AppDatePickerProps {
  label?: string
  name: string
  value?: string | Date // ISO date string "YYYY-MM-DD" or Date
  defaultValue?: string | Date
  onChange?: (dateStr: string) => void
  required?: boolean
  disabled?: boolean
  placeholder?: string
  className?: string
}

/** Format a Date to a local "YYYY-MM-DD" string (avoids UTC off-by-one). */
function toISODateLocal(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, "0")
  const d = String(date.getDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}

/** Normalize incoming value to a local "YYYY-MM-DD" string. */
function normalizeDate(dateValue?: string | Date): string {
  if (!dateValue) return ""
  if (dateValue instanceof Date) return toISODateLocal(dateValue)
  return String(dateValue).split("T")[0]
}

/** Parse a "YYYY-MM-DD" string into a local Date (midnight local time). */
function parseISODateLocal(str: string): Date | undefined {
  if (!str) return undefined
  const [y, m, d] = str.split("-").map(Number)
  if (!y || !m || !d) return undefined
  return new Date(y, m - 1, d)
}

export function AppDatePicker({
  label,
  name,
  value,
  defaultValue,
  onChange,
  required,
  disabled,
  placeholder = "Pilih tanggal",
  className,
}: AppDatePickerProps) {
  const isControlled = value !== undefined
  const [internal, setInternal] = useState<string>(normalizeDate(defaultValue))
  const [open, setOpen] = useState(false)
  const current = isControlled ? normalizeDate(value) : internal
  const selectedDate = parseISODateLocal(current)

  function handleSelect(date: Date | undefined) {
    const next = date ? toISODateLocal(date) : ""
    if (!isControlled) setInternal(next)
    onChange?.(next)
    setOpen(false)
  }

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {label && (
        <Label htmlFor={`${name}-trigger`} className="text-sm font-medium text-foreground">
          {label}
        </Label>
      )}
      {/* Hidden input keeps server-action FormData(name) working unchanged. */}
      <input type="hidden" name={name} value={current} />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={`${name}-trigger`}
            type="button"
            variant="outline"
            disabled={disabled}
            aria-required={required}
            className={cn(
              "h-10 w-full justify-start gap-2 px-3 font-normal",
              !current && "text-muted-foreground"
            )}
          >
            <CalendarIcon className="size-4 opacity-70" />
            {selectedDate
              ? format(selectedDate, "d MMMM yyyy", { locale: idLocale })
              : placeholder}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={selectedDate}
            onSelect={handleSelect}
            defaultMonth={selectedDate}
            autoFocus
          />
        </PopoverContent>
      </Popover>
    </div>
  )
}
