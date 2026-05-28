"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { signIn } from "next-auth/react"
import { Eye, EyeOff, Lock, Mail, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/page-header"

export default function LoginPage() {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const formData = new FormData(e.currentTarget)
    const email = formData.get("email") as string
    const password = formData.get("password") as string

    const result = await signIn("credentials", { email, password, redirect: false })

    if (result?.error) {
      setError("Email atau password salah")
      setLoading(false)
    } else {
      router.push("/")
      router.refresh()
    }
  }

  return (
    <div className="login-wrapper">
      {/* Animated background orbs */}
      <div className="login-bg-orb login-bg-orb-1" />
      <div className="login-bg-orb login-bg-orb-2" />
      <div className="login-bg-orb login-bg-orb-3" />

      <div className="login-card">
        {/* Logo & Branding */}
        <div className="login-brand">
          <div className="login-logo">
            <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
              <rect width="40" height="40" rx="12" fill="url(#logo-grad)" />
              <path d="M12 20L18 14L24 20L18 26L12 20Z" fill="white" opacity="0.9" />
              <path d="M18 14L24 20L30 14L24 8L18 14Z" fill="white" opacity="0.6" />
              <path d="M18 26L24 20L30 26L24 32L18 26Z" fill="white" opacity="0.6" />
              <defs>
                <linearGradient id="logo-grad" x1="0" y1="0" x2="40" y2="40">
                  <stop stopColor="#dc2626" />
                  <stop offset="1" stopColor="#ef4444" />
                </linearGradient>
              </defs>
            </svg>
          </div>
          <h1 className="login-title">YaraERP</h1>
          <p className="login-subtitle">Enterprise Resource Planning</p>
        </div>

        {/* Error */}
        {error && (
          <div className="login-error" role="alert">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" /></svg>
            <span>{error}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="login-form">
          <div className="login-field">
            <label htmlFor="email" className="login-label">Email</label>
            <div className="login-input-wrapper">
              <Mail className="login-input-icon" size={18} />
              <input
                id="email"
                name="email"
                type="email"
                required
                autoComplete="email"
                className="login-input"
                placeholder="nama@perusahaan.com"
              />
            </div>
          </div>

          <div className="login-field">
            <label htmlFor="password" className="login-label">Password</label>
            <div className="login-input-wrapper">
              <Lock className="login-input-icon" size={18} />
              <input
                id="password"
                name="password"
                type={showPassword ? "text" : "password"}
                required
                autoComplete="current-password"
                className="login-input"
                placeholder="••••••••"
              />
              <Button
                type="button"
                className="login-eye-btn"
                onPress={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? "Sembunyikan password" : "Tampilkan password"}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </Button>
            </div>
          </div>

          <Button type="submit" isDisabled={loading} className="login-btn" id="login-submit">
            {loading ? (
              <>
                <Loader2 size={18} className="login-spinner" />
                Memproses...
              </>
            ) : (
              "Masuk"
            )}
          </Button>
        </form>

        {/* Footer */}
        <div className="login-footer">
          <p>© 2026 YaraERP. All rights reserved.</p>
        </div>
      </div>
    </div>
  )
}
