"use client"

import { useSidebarStore } from "@/lib/stores"

export function AppMain({ children }: { children: React.ReactNode }) {
  const { isOpen } = useSidebarStore()

  return (
    <div className={`app-main ${!isOpen ? "sidebar-closed" : ""}`}>
      {children}
    </div>
  )
}
