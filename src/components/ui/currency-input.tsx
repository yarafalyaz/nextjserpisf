"use client"

import { useState, useCallback, useRef, useEffect } from "react"

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

  const [displayValue, setDisplayValue] = useState(() =>
    formatDisplay(isControlled ? controlledValue : defaultValue)
  )

  const hiddenRef = useRef<HTMLInputElement>(null)

  // Sync controlled value
  useEffect(() => {
    if (isControlled) {
      setDisplayValue(formatDisplay(controlledValue))
    }
  }, [controlledValue, isControlled])

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value
      // Allow only digits, dots, commas
      const sanitized = raw.replace(/[^\d.,]/g, "")
      setDisplayValue(sanitized)

      const numericValue = parseInput(sanitized)
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
      // On focus, show raw number for easy editing
      const numericValue = parseInput(displayValue)
      if (numericValue !== 0) {
        setDisplayValue(String(numericValue))
      }
      // Select all for easy replacement
      setTimeout(() => e.target.select(), 0)
    },
    [displayValue]
  )

  const numericValue = parseInput(displayValue)

  return (
    <div className="relative">
      {prefix && (
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted pointer-events-none">
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
        className={`${className} ${prefix ? "pl-10" : ""}`}
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
