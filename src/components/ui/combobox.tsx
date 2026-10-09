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
            aria-label={ariaLabel}
            aria-expanded={open}
            aria-required={required || undefined}
            isDisabled={disabled}
            variant="outline"
            className={cn(
              "w-full justify-between font-normal",
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
                    onSelect={() => {
                      onChange?.(opt.value);
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={cn(
                        "mr-2 size-4",
                        opt.value === value ? "opacity-100" : "opacity-0",
                      )}
                    />
                    {opt.label}
                  </CommandItem>
                ))}
              </CommandGroup>
              {onCreateNew && (
                <>
                  <CommandSeparator />
                  <CommandGroup>
                    <CommandItem
                      // A stable, non-colliding value; `cmdk` filters on this so
                      // it must always survive the active search term.
                      value={`__create_new__ ${search}`}
                      onSelect={() => {
                        onCreateNew(search.trim());
                        setOpen(false);
                      }}
                      className="text-primary"
                    >
                      <Plus className="mr-2 size-4" aria-hidden="true" />
                      {createNewLabel}
                    </CommandItem>
                  </CommandGroup>
                </>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
