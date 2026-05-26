"use client"

import { RouterProvider } from "react-aria-components"
import { Toast } from "@heroui/react"
import { useRouter } from "next/navigation"

export function UIProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter()

  return (
    <RouterProvider navigate={router.push}>
      {children}
      <Toast.Provider placement="bottom end" />
    </RouterProvider>
  )
}
