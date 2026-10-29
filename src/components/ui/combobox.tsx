"use client";

import { useState } from "react";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/shadcn/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/shadcn/command";

export interface ComboboxOption {
  value: string;
  label: string;
  /** Record soft-deleted: renderer coret + disabled (bare Record → strikethrough deleted). */
  disabled?: boolean;
}

interface ComboboxProps {
  options: ComboboxOption[];
  value?: string | null;
  onChange?: (value: string | null) => void;
  /** Placeholder shown in the trigger button. */
  placeholder?: string;
  disabled?: boolean;
  /** Optional hidden input so the value is submitted with native forms. */
  name?: string;
  id?: string;
  className?: string;
  emptyText?: string;
  /** Marks the field as required. */
  required?: boolean;
  /**
   * Enables the "＋ <createNewLabel>" affordance at the bottom of the list.
   * Fired with the current search term, so a caller can prefill the quick-add
   * form (e.g. a category named after what the user typed).
   */
  onCreateNew?: (search: string) => void;
  /** Label of the create-new row. Default "Tambah baru...". */
  createNewLabel?: string;
  "aria-label"?: string;
  /** Id label eksternal (`<label htmlFor={id}>` / `id="…-label"`). Diabaikan bila `aria-label` diisi. */
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
}

/**
 * Searchable combobox built on shadcn/ui Popover + Command.
 * Maintains the same API as the previous custom implementation.
 *
 * When `onCreateNew` is set, a "Tambah baru..." row is rendered below the
 * options so a missing master record can be created without leaving the form.
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
  onCreateNew,
  createNewLabel = "Tambah baru...",
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
  "aria-describedby": ariaDescribedBy,
}: ComboboxProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const selected = options.find((o) => o.value === value) || null;

  return (
    <div className={cn("relative w-full", className)}>
      {name && <input type="hidden" name={name} value={value ?? ""} />}
      <Popover
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setSearch("");
        }}
      >
        <PopoverTrigger asChild>
          <Button
            id={id}
            role="combobox"
            // Nama SR: aria-label eksplisit menang; tanpa itu label eksternal
            // dialamatkan lewat aria-labelledby (label htmlFor mengarah ke id
            // ini, tapi <button role=combobox> bukan labelable element,
            // jadi htmlFor saja tidak memberi nama). Fallback terakhir:
            // id turunan `${id}-label` bila pemanggil memberi span label.
            aria-label={ariaLabel}
            aria-labelledby={
              ariaLabel ? undefined : (ariaLabelledBy ?? (id ? `${id}-label` : undefined))
            }
            aria-describedby={ariaDescribedBy}
            aria-expanded={open}
            aria-required={required || undefined}
            isDisabled={disabled}
            variant="outline"
            className={cn(
              // Trigger md h-9 (36px): area sentuh diperluas ke 44px via
              // pseudo vertikal, visual tetap (pola search-field).
              "relative w-full justify-between font-normal before:absolute before:-inset-y-1 before:content-['']",
              !selected && "text-muted-foreground",
            )}
          >
            <span className="truncate">
              {selected ? selected.label : placeholder}
            </span>
            <ChevronsUpDown className="size-4 shrink-0 opacity-50" aria-hidden="true" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          sideOffset={4}
          className="w-(--radix-popover-trigger-width) p-0"
        >
          <Command>
            <CommandInput
              placeholder={placeholder}
              value={search}
              onValueChange={setSearch}
            />
            <CommandList>
              {!onCreateNew && <CommandEmpty>{emptyText}</CommandEmpty>}
              <CommandGroup>
                {options.map((opt) => (
                  <CommandItem
                    key={opt.value}
                    value={opt.label}
                    disabled={!!opt.disabled}
                    onSelect={() => {
                      if (opt.disabled) return;
                      onChange?.(opt.value);
                      setOpen(false);
                    }}
                    className={cn(opt.disabled && "opacity-60 line-through")}
                  >
                    <Check
                      className={cn(
                        "mr-2 size-4",
                        opt.value === value ? "opacity-100" : "opacity-0",
                      )}
                    />
                    {opt.label}
                    {opt.disabled && <span className="ml-2 text-xs text-muted-foreground">(dihapus)</span>}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
            {onCreateNew && (
              <>
                <CommandSeparator />
                {/* Aksi, bukan pilihan. Sebelumnya baris ini adalah CommandItem, sehingga
                    ikut menjadi opsi listbox: memilih opsi pertama (panah + Enter, atau
                    skrip E2E yang mengambil `[role=option]` pertama) membuka dialog ini
                    alih-alih memilih baris data. Sebagai <button> ia tidak lagi menjadi
                    bagian navigasi listbox. */}
                <button
                  type="button"
                  onClick={() => {
                    onCreateNew(search.trim());
                    setOpen(false);
                  }}
                  className="text-primary flex w-full items-center px-2 py-2.5 text-sm min-h-11"
                >
                  <Plus className="mr-2 size-4" aria-hidden="true" />
                  {createNewLabel}
                </button>
              </>
            )}
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
