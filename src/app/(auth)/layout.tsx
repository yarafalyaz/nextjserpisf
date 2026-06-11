import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Login — Silengkap",
  description: "Masuk ke sistem ERP Silengkap",
}

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
