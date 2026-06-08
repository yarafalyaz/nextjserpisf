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

  function handleSubmit(e: React.FormEvent) {
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
    <form onSubmit={handleSubmit} className={cn("relative min-w-0 flex-1 max-w-sm", className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        type="text"
        name={paramName}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        className="pl-9 pr-9"
      />
      {value && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={handleClear}
          aria-label="Bersihkan pencarian"
          className="absolute right-1 top-1/2 size-7 -translate-y-1/2 text-muted-foreground"
        >
          <X className="size-4" />
        </Button>
      )}
    </form>
  )
}
