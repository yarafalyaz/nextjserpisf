"use client"
import nextDynamic from "next/dynamic"

// Fix: cmdk is a heavy lib — lazy-load it client-side only
export const CommandPalette = nextDynamic(
  () => import("@/components/layout/command-palette").then((m) => m.CommandPalette),
  { ssr: false, loading: () => null },
)
