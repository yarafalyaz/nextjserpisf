"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { useState } from "react"
import { Search, X } from "lucide-react"

interface AppSearchFieldProps {
  placeholder?: string
  action: string
  paramName?: string
}

export function AppSearchField({ placeholder = "Cari...", action, paramName = "search" }: AppSearchFieldProps) {
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
    params.delete("page")
    router.push(`${action}?${params.toString()}`)
  }

  function handleClear() {
    setValue("")
    const params = new URLSearchParams(searchParams.toString())
    params.delete(paramName)
    params.delete("page")
    router.push(`${action}?${params.toString()}`)
  }

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "8px",
        padding: "8px 12px",
        background: "var(--bg-secondary)",
        border: "1px solid var(--border-color)",
        borderRadius: "10px",
        transition: "border-color 0.2s ease",
      }}
    >
      <Search size={16} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
      <input
        type="text"
        name={paramName}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        style={{
          flex: 1,
          border: "none",
          outline: "none",
          background: "transparent",
          fontSize: "0.875rem",
          color: "var(--text-primary)",
        }}
      />
      {value && (
        <button
          type="button"
          onClick={handleClear}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: "20px",
            height: "20px",
            borderRadius: "50%",
            border: "none",
            background: "var(--bg-tertiary)",
            color: "var(--text-muted)",
            cursor: "pointer",
          }}
        >
          <X size={14} />
        </button>
      )}
    </form>
  )
}
