"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { useState } from "react"
import { Search, X } from "lucide-react"
import { Input } from "@/components/ui/shadcn/input"
import { Button } from "@/components/ui/shadcn/button"
import { cn } from "@/lib/utils"

interface AppSearchFieldProps {
  placeholder?: string
  action: string
  paramName?: string
  className?: string
}

export function AppSearchField({
  placeholder = "Cari...",
  action,
  paramName = "cari",
  className,
}: AppSearchFieldProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [value, setValue] = useState(searchParams.get(paramName) || "")

  function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault()
    const params = new URLSearchParams(searchParams.toString())
    if (value) {
      params.set(paramName, value)
    } else {
      params.delete(paramName)
    }
    params.delete("halaman")
    router.push(`${action}?${params.toString()}`)
  }

  function handleClear() {
    setValue("")
    const params = new URLSearchParams(searchParams.toString())
    params.delete(paramName)
    params.delete("halaman")
    router.push(`${action}?${params.toString()}`)
  }

  return (
    <form role="search" aria-label={placeholder} onSubmit={handleSubmit} className={cn("relative min-w-0 flex-1 max-w-sm", className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
      <Input
        type="text"
        name={paramName}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="pl-9 pr-9"
      />
      {value && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={handleClear}
          aria-label="Bersihkan pencarian"
          // D14: tombol ikon di dalam input dibuat 32px (size-8) — size-7 (28px)
          // di bawah target sentuh. Full 44px membuat tombol lebih tinggi dari
          // inputnya; 32px kompromi yang dipakai tombol ikon sejenis.
          className="absolute right-1 top-1/2 size-8 -translate-y-1/2 text-muted-foreground"
        >
          <X className="size-4" />
        </Button>
      )}
    </form>
  )
}
