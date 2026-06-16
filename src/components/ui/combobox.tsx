"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ComboboxOption {
  value: string;
  label: string;
}

interface ComboboxProps {
  options: ComboboxOption[];
  value?: string | null;
  onChange?: (value: string | null) => void;
  /** Placeholder shown in the search input (kept stable for tests, e.g. "Cari customer..."). */
  placeholder?: string;
  disabled?: boolean;
  /** Optional hidden input so the value is submitted with native forms. */
  name?: string;
  id?: string;
  className?: string;
  emptyText?: string;
  /** Marks the field as required. The visible (focusable) combobox input gets
   *  `aria-required` for screen readers and a native `required` while no value
   *  is selected, so HTML validation shows a focusable bubble. We deliberately
   *  do NOT put `required` on the hidden input — a required+empty hidden field
   *  triggers Chrome's unfocusable "invalid form control" error and silently
   *  blocks submit. Server-side Zod still enforces the value. */
  required?: boolean;
  "aria-label"?: string;
}

/**
 * Lightweight, accessible autocomplete combobox built on plain elements.
 * The search input is always present in the DOM (with its placeholder) so
 * existing E2E selectors keep working. Options expose role="option".
 */
export function Combobox({
  options,
  value,
  onChange,
  placeholder = "Cari...",
  disabled,
  name,
  id,
  className,
  emptyText = "Tidak ada data",
  required,
  "aria-label": ariaLabel,
}: ComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const optionIdPrefix = useId();

  const selected = options.find((o) => o.value === value) || null;
  const filtered = query
    ? options.filter((o) => o.label.toLowerCase().includes(query.toLowerCase()))
    : options;

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  function select(opt: ComboboxOption) {
    onChange?.(opt.value);
    setOpen(false);
    setQuery("");
  }

  // Text shown in the input: search query while open, selected label otherwise.
  const inputValue = open ? query : (selected?.label ?? "");

  return (
    <div ref={containerRef} className={cn("relative w-full", className)}>
      {name && <input type="hidden" name={name} value={value ?? ""} />}
      <div
        className={cn(
          "flex h-9 w-full items-center gap-2 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors",
          "focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/30",
          disabled && "cursor-not-allowed opacity-60",
        )}
      >
        <input
          id={id}
          role="combobox"
          aria-label={ariaLabel}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-required={required || undefined}
          required={required && !value ? true : undefined}
          aria-activedescendant={
            open && filtered.length > 0
              ? `${optionIdPrefix}-${activeIndex}`
              : undefined
          }
          autoComplete="off"
          disabled={disabled}
          className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed"
          placeholder={placeholder}
          value={inputValue}
          onFocus={() => !disabled && setOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            setActiveIndex(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setOpen(true);
              setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActiveIndex((i) => Math.max(i - 1, 0));
            } else if (e.key === "Enter") {
              e.preventDefault();
              const opt = filtered[activeIndex];
              if (opt) select(opt);
            } else if (e.key === "Escape") {
              setOpen(false);
            }
          }}
        />
        <ChevronsUpDown className="size-4 shrink-0 opacity-50" aria-hidden />
      </div>

      {open && !disabled && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-md border border-default bg-popover p-1 text-popover-foreground shadow-md"
        >
          {filtered.length === 0 ? (
            <li className="px-2 py-1.5 text-sm text-muted-foreground">
              {emptyText}
            </li>
          ) : (
            filtered.map((opt, i) => {
              const isSelected = opt.value === value;
              return (
                <li
                  key={opt.value}
                  id={`${optionIdPrefix}-${i}`}
                  role="option"
                  aria-selected={isSelected}
                  className={cn(
                    "flex cursor-pointer items-center justify-between rounded-sm px-2 py-1.5 text-sm",
                    i === activeIndex
                      ? "bg-accent text-accent-foreground"
                      : "hover:bg-accent hover:text-accent-foreground",
                  )}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    select(opt);
                  }}
                  onMouseEnter={() => setActiveIndex(i)}
                >
                  {opt.label}
                  {isSelected && (
                    <Check className="size-4" aria-hidden="true" />
                  )}
                </li>
              );
            })
          )}
        </ul>
      )}
    </div>
  );
}
