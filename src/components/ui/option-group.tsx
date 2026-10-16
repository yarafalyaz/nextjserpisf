"use client"

import { Label } from "@/components/ui/shadcn/label"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/shadcn/toggle-group"
import { cn } from "@/lib/utils"

export interface OptionGroupChoice {
  value: string
  label: string
}

interface OptionGroupProps {
  label: string
  /** Menghubungkan label ke grup lewat aria-labelledby. */
  id?: string
  value: string
  onChange: (value: string) => void
  options: OptionGroupChoice[]
  /** Izinkan pilihan dikosongkan lagi — hanya untuk field opsional. */
  optional?: boolean
  className?: string
}

/**
 * Segmented control untuk pilihan tunggal berjumlah sedikit (2–3).
 *
 * Menggantikan pola RadioGroup telanjang yang mengambang di grid form: dua
 * bulatan kecil tanpa wadah sehingga terbaca seperti teks nyasar, padahal
 * kontrol di sekitarnya berupa kotak bergaris penuh. Di sini opsi menjadi satu
 * kontrol bergaris yang menyatu, selebar kolomnya.
 *
 * Radix merender type="single" sebagai role="radiogroup" dengan item
 * role="radio" + aria-checked, jadi semantiknya sama dengan radio yang diganti.
 */
export function OptionGroup({
  label,
  id,
  value,
  onChange,
  options,
  optional = false,
  className,
}: OptionGroupProps) {
  const labelId = id ? `${id}-label` : undefined

  return (
    <div className="flex flex-col gap-1.5">
      <Label id={labelId}>{label}</Label>
      <ToggleGroup
        type="single"
        variant="outline"
        spacing={0}
        value={value}
        aria-labelledby={labelId}
        // Radix melepas pilihan saat item yang aktif ditekan lagi. Untuk field
        // wajib, tahan nilainya daripada diam-diam jadi kosong.
        onValueChange={(next) => {
          if (!next && !optional) return
          onChange(next)
        }}
        className={cn("w-full", className)}
      >
        {options.map((choice) => (
          <ToggleGroupItem
            key={choice.value}
            value={choice.value}
            className="grow basis-0 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground data-[state=on]:hover:bg-primary/90"
          >
            {choice.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  )
}

/**
 * Jenis kelamin. Nilainya mengikuti enum `male|female` di
 * `src/lib/validations/schemas.ts` — satu kosakata untuk pelanggan dan karyawan.
 */
export const GENDER_CHOICES: OptionGroupChoice[] = [
  { value: "male", label: "Laki-laki" },
  { value: "female", label: "Perempuan" },
]
