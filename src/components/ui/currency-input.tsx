"use client"

import { useState, useCallback, useRef } from "react"
import { cn } from "@/lib/utils"

const INPUT_BASE_CLASS =
  "h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:bg-input/30"

interface CurrencyInputProps {
  name?: string
  value?: number | string | null
  defaultValue?: number | string | null
  onChange?: (value: number) => void
  onBlur?: (e: React.FocusEvent<HTMLInputElement>) => void
  placeholder?: string
  className?: string
  id?: string
  required?: boolean
  disabled?: boolean
  min?: number
  max?: number
  prefix?: string
  style?: React.CSSProperties
}

/**
 * Input angka dengan separator titik (format Indonesia).
 * Display: 2.500.000 | Value: 2500000
 */
export function CurrencyInput({
  name,
  value: controlledValue,
  defaultValue,
  onChange,
  onBlur,
  placeholder = "0",
  className = "",
  id,
  required,
  disabled,
  min,
  max,
  prefix,
  style,
}: CurrencyInputProps) {
  const isControlled = controlledValue !== undefined

  function formatDisplay(num: number | string | null | undefined): string {
    if (num === null || num === undefined || num === "") return ""
    const n = typeof num === "string" ? parseFloat(num) : num
    if (isNaN(n)) return ""
    return new Intl.NumberFormat("id-ID").format(n)
  }

  function parseInput(str: string): number {
    // Remove dots (thousand separator) and replace comma with dot (decimal)
    const cleaned = str.replace(/\./g, "").replace(",", ".")
    const n = parseFloat(cleaned)
    return isNaN(n) ? 0 : n
  }

  const [prevControlledValue, setPrevControlledValue] = useState<number | string | null | undefined>(controlledValue)
  const [displayValue, setDisplayValue] = useState(() =>
    formatDisplay(isControlled ? controlledValue : defaultValue)
  )

  if (isControlled && controlledValue !== prevControlledValue) {
    setPrevControlledValue(controlledValue)
    if (controlledValue === null || controlledValue === undefined || controlledValue === "") {
      setDisplayValue("")
    } else {
      const currentNum = parseInput(displayValue)
      const newNum = typeof controlledValue === "string" ? parseFloat(controlledValue) : controlledValue
      if (currentNum !== newNum || isNaN(currentNum)) {
        setDisplayValue(formatDisplay(controlledValue))
      }
    }
  }

  const hiddenRef = useRef<HTMLInputElement>(null)

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value
      // Keep only digits and a single comma (decimal separator, id-ID)
      let sanitized = raw.replace(/[^\d,]/g, "")
      const firstComma = sanitized.indexOf(",")
      if (firstComma !== -1) {
        sanitized =
          sanitized.slice(0, firstComma + 1) + sanitized.slice(firstComma + 1).replace(/,/g, "")
      }

      // Format integer part with thousand separators live while typing
      const [intPart, decPart] = sanitized.split(",")
      const intNum = intPart ? parseInt(intPart, 10) : NaN
      const formattedInt = isNaN(intNum) ? "" : new Intl.NumberFormat("id-ID").format(intNum)
      const display = decPart !== undefined ? `${formattedInt},${decPart}` : formattedInt

      setDisplayValue(display)

      const numericValue = parseInput(display)
      if (hiddenRef.current) {
        hiddenRef.current.value = String(numericValue)
      }
      onChange?.(numericValue)
    },
    [onChange]
  )

  const handleBlur = useCallback(
    (e: React.FocusEvent<HTMLInputElement>) => {
      // Reformat on blur
      const numericValue = parseInput(displayValue)
      let clamped = numericValue
      if (min !== undefined && clamped < min) clamped = min
      if (max !== undefined && clamped > max) clamped = max
      setDisplayValue(formatDisplay(clamped))
      if (hiddenRef.current) {
        hiddenRef.current.value = String(clamped)
      }
      if (clamped !== numericValue) {
        onChange?.(clamped)
      }
      onBlur?.(e)
    },
    [displayValue, onChange, onBlur, min, max]
  )

  const handleFocus = useCallback(
    (e: React.FocusEvent<HTMLInputElement>) => {
      // Keep the formatted value; just select all for easy replacement
      setTimeout(() => e.target.select(), 0)
    },
    []
  )

  const numericValue = parseInput(displayValue)

  return (
    <div className="relative">
      {prefix && (
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">
          {prefix}
        </span>
      )}
      <input
        type="text"
        inputMode="numeric"
        id={id}
        value={displayValue}
        onChange={handleChange}
        onBlur={handleBlur}
        onFocus={handleFocus}
        placeholder={placeholder}
        className={cn(INPUT_BASE_CLASS, prefix ? "pl-10" : "", className)}
        style={style}
        required={required}
        disabled={disabled}
        autoComplete="off"
      />
      {/* Hidden input for form submission */}
      {name && (
        <input
          ref={hiddenRef}
          type="hidden"
          name={name}
          value={numericValue}
        />
      )}
    </div>
  )
}
