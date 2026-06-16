"use client"

import { useState } from "react"
import { Clock } from "lucide-react"
import { Combobox } from "@/components/ui/combobox"
import { cn } from "@/lib/utils"

interface AppTimePickerProps {
  /** Controlled value "HH:MM". */
  value?: string
  /** Uncontrolled initial value "HH:MM". */
  defaultValue?: string
  onChange?: (value: string) => void
  /** Hidden input name for native form submission. */
  name?: string
  id?: string
  disabled?: boolean
  /** Minute granularity. Default 5. */
  minuteStep?: number
  className?: string
}

const pad = (n: number) => String(n).padStart(2, "0")

/**
 * Compact time picker built from two searchable Comboboxes (Jam : Menit),
 * replacing the rigid native <input type="time"> wheel.
 * Supports controlled (value/onChange) and uncontrolled (defaultValue + name).
 */
export function AppTimePicker({
  value,
  defaultValue,
  onChange,
  name,
  id,
  disabled,
  minuteStep = 5,
  className,
}: AppTimePickerProps) {
  const isControlled = value !== undefined
  const [internal, setInternal] = useState(defaultValue ?? "")
  const current = isControlled ? value ?? "" : internal
  const [h, m] = current && current.includes(":") ? current.split(":") : ["", ""]

  const hourOptions = Array.from({ length: 24 }, (_, i) => ({ value: pad(i), label: pad(i) }))

  const minuteValues: string[] = []
  for (let i = 0; i < 60; i += minuteStep) minuteValues.push(pad(i))
  if (m && !minuteValues.includes(m)) {
    minuteValues.push(m)
    minuteValues.sort()
  }
  const minuteOptions = minuteValues.map((mm) => ({ value: mm, label: mm }))

  function emit(nextHour: string, nextMinute: string) {
    const hh = nextHour || (nextMinute ? "00" : "")
    const mm = nextMinute || (nextHour ? "00" : "")
    const next = hh && mm ? `${hh}:${mm}` : ""
    if (!isControlled) setInternal(next)
    onChange?.(next)
  }

  return (
    <div
      role="group"
      aria-label="Pemilih waktu"
      className={cn("flex items-center gap-1.5", className)}
    >
      {name && <input type="hidden" name={name} value={current} />}
      <Clock className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <div className="w-20 shrink-0">
        <Combobox
          id={id}
          aria-label="Jam"
          options={hourOptions}
          value={h || null}
          onChange={(k) => emit(k ?? "", m)}
          placeholder="Jam"
          disabled={disabled}
        />
      </div>
      <span className="text-muted-foreground" aria-hidden="true">:</span>
      <div className="w-20 shrink-0">
        <Combobox
          id={id ? `${id}-menit` : undefined}
          aria-label="Menit"
          options={minuteOptions}
          value={m || null}
          onChange={(k) => emit(h, k ?? "")}
          placeholder="Menit"
          disabled={disabled}
        />
      </div>
    </div>
  )
}
