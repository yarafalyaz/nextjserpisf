"use client"

import { useState } from "react"
import { Check, ChevronsUpDown, X } from "lucide-react"
import { cn } from "@/lib/utils"
import type { ComboboxOption } from "@/components/ui/combobox"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/shadcn/badge"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/shadcn/popover"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/shadcn/command"

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
 * Multi-select combobox built on shadcn/ui Popover + Command.
 * Selected items shown as badges in the trigger; dropdown supports search + toggle.
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

  const selectedSet = new Set(value)
  const selectedOptions = options.filter((o) => selectedSet.has(o.value))

  function toggle(optValue: string) {
    if (selectedSet.has(optValue)) onChange(value.filter((v) => v !== optValue))
    else onChange([...value, optValue])
  }

  return (
    <div className={cn("relative w-full", className)}>
      {name && value.map((v) => <input key={v} type="hidden" name={name} value={v} />)}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            role="combobox"
            aria-expanded={open}
            isDisabled={disabled}
            variant="outline"
            className="h-auto min-h-9 w-full justify-between gap-1.5 px-3 py-1.5 font-normal"
          >
            <div className="flex flex-wrap items-center gap-1">
              {selectedOptions.length === 0 && (
                <span className="text-muted-foreground">{placeholder}</span>
              )}
              {selectedOptions.map((o) => (
                <Badge
                  key={o.value}
                  variant="secondary"
                  className="gap-1 pr-1"
                >
                  {o.label}
                  <button
                    type="button"
                    aria-label={`Hapus ${o.label}`}
                    className="ml-0.5 rounded-sm outline-hidden hover:bg-secondary-foreground/20"
                    onMouseDown={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      toggle(o.value)
                    }}
                  >
                    <X className="size-3" aria-hidden="true" />
                  </button>
                </Badge>
              ))}
            </div>
            <ChevronsUpDown className="size-4 shrink-0 opacity-50" aria-hidden="true" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          sideOffset={4}
          className="w-(--radix-popover-trigger-width) p-0"
        >
          <Command>
            <CommandInput placeholder={placeholder} />
            <CommandList>
              <CommandEmpty>{emptyText}</CommandEmpty>
              <CommandGroup>
                {options.map((opt) => (
                  <CommandItem
                    key={opt.value}
                    value={opt.label}
                    onSelect={() => toggle(opt.value)}
                  >
                    <Check
                      className={cn(
                        "mr-2 size-4",
                        selectedSet.has(opt.value) ? "opacity-100" : "opacity-0",
                      )}
                    />
                    {opt.label}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  )
}
