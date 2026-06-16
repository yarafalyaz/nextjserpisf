"use client"

import { useState } from "react"
import { Combobox } from "@/components/ui/combobox"

export interface FormSelectOption {
  value: string
  label: string
}

interface FormSelectProps {
  value?: string | null
  defaultValue?: string | null
  onValueChange?: (value: string) => void
  placeholder?: string
  options: FormSelectOption[]
  id?: string
  name?: string
  disabled?: boolean
  required?: boolean
  className?: string
  "aria-label"?: string
}

/**
 * Searchable combobox that preserves the previous FormSelect API.
 * Every dropdown built on FormSelect is therefore a Combobox (type-to-search),
 * while still supporting react-hook-form Controllers (controlled via `value`)
 * and native form submission (uncontrolled via `defaultValue` + `name`).
 */
export function FormSelect({
  value,
  defaultValue,
  onValueChange,
  placeholder = "-- Pilih --",
  options,
  id,
  name,
  disabled,
  required,
  className,
  "aria-label": ariaLabel,
}: FormSelectProps) {
  const isControlled = value !== undefined
  const [internal, setInternal] = useState<string | null>(defaultValue ?? null)
  const current = isControlled ? value ?? null : internal

  return (
    <Combobox
      id={id}
      name={name}
      options={options}
      value={current}
      onChange={(v) => {
        if (!isControlled) setInternal(v)
        onValueChange?.(v ?? "")
      }}
      placeholder={placeholder}
      disabled={disabled}
      required={required}
      className={className}
      aria-label={ariaLabel}
    />
  )
}
