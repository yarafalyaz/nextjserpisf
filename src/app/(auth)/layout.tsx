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
  return (
    <div className="auth-layout">
      <div className="auth-container">
        {children}
      </div>
    </div>
  )
}
