"use client"

import { Toaster } from "@/components/ui/shadcn/sonner"

export function UIProvider({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <Toaster position="top-center" closeButton />
    </>
  )
}
