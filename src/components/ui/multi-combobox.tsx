"use client"

import { useEffect, useId, useRef, useState } from "react"
import { Check, ChevronsUpDown, X } from "lucide-react"
import { cn } from "@/lib/utils"
import type { ComboboxOption } from "@/components/ui/combobox"

interface MultiComboboxProps {
  options: ComboboxOption[]
  value: string[]
  onChange: (value: string[]) => void
  placeholder?: string
  disabled?: boolean
  /** Emits one hidden input per selected value so native forms submit them all. */
  name?: string
  id?: string
  className?: string
  emptyText?: string
}

/**
 * Multi-select combobox (type-to-search, multiple selections shown as chips).
 * Selecting an option toggles it and keeps the dropdown open.
 */
export function MultiCombobox({
  options,
  value,
  onChange,
  placeholder = "Cari...",
  disabled,
  name,
  id,
  className,
  emptyText = "Tidak ada data",
}: MultiComboboxProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const containerRef = useRef<HTMLDivElement>(null)
  const listId = useId()

  const selectedSet = new Set(value)
  const selectedOptions = options.filter((o) => selectedSet.has(o.value))
  const filtered = query
    ? options.filter((o) => o.label.toLowerCase().includes(query.toLowerCase()))
    : options

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
        setQuery("")
      }
    }
    document.addEventListener("mousedown", onDocClick)
    return () => document.removeEventListener("mousedown", onDocClick)
  }, [])

  function toggle(optValue: string) {
    if (selectedSet.has(optValue)) onChange(value.filter((v) => v !== optValue))
    else onChange([...value, optValue])
    setQuery("")
  }

  return (
    <div ref={containerRef} className={cn("relative w-full", className)}>
      {name && value.map((v) => <input key={v} type="hidden" name={name} value={v} />)}
      <div
        className={cn(
          "flex min-h-9 w-full flex-wrap items-center gap-1 rounded-md border border-input bg-transparent px-2 py-1 text-sm shadow-xs transition-colors",
          "focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/30",
          disabled && "cursor-not-allowed opacity-60"
        )}
        onClick={() => !disabled && setOpen(true)}
      >
        {selectedOptions.map((o) => (
          <span
            key={o.value}
            className="inline-flex items-center gap-1 rounded bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary"
          >
            {o.label}
            <button
              type="button"
              aria-label={`Hapus ${o.label}`}
              className="hover:text-danger"
              onMouseDown={(e) => {
                e.preventDefault()
                e.stopPropagation()
                toggle(o.value)
              }}
            >
              <X className="size-3" aria-hidden="true" />
            </button>
          </span>
        ))}
        <input
          id={id}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          autoComplete="off"
          disabled={disabled}
          className="min-w-[6rem] flex-1 bg-transparent py-0.5 outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed"
          placeholder={selectedOptions.length === 0 ? placeholder : ""}
          value={query}
          onFocus={() => !disabled && setOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") setOpen(false)
            if (e.key === "Backspace" && query === "" && value.length > 0) {
              onChange(value.slice(0, -1))
            }
          }}
        />
        <ChevronsUpDown className="size-4 shrink-0 opacity-50" aria-hidden="true" />
      </div>

      {open && !disabled && (
        <ul
          id={listId}
          role="listbox"
          aria-multiselectable="true"
          className="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-md border border-default bg-popover p-1 text-popover-foreground shadow-md"
        >
          {filtered.length === 0 ? (
            <li className="px-2 py-1.5 text-sm text-muted-foreground">{emptyText}</li>
          ) : (
            filtered.map((opt) => {
              const isSelected = selectedSet.has(opt.value)
              return (
                <li
                  key={opt.value}
                  role="option"
                  aria-selected={isSelected}
                  className={cn(
                    "flex cursor-pointer items-center justify-between rounded-sm px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground"
                  )}
                  onMouseDown={(e) => {
                    e.preventDefault()
                    toggle(opt.value)
                  }}
                >
                  {opt.label}
                  {isSelected && <Check className="size-4" aria-hidden="true" />}
                </li>
              )
            })
          )}
        </ul>
      )}
    </div>
  )
}
