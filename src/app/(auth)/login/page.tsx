import { LoginForm } from "@/components/login-form"

export default function LoginPage() {
  return (
    <div className="login-wrapper">
      {/* Animated background orbs */}
      <div className="login-bg-orb login-bg-orb-1" />
      <div className="login-bg-orb login-bg-orb-2" />
      <div className="login-bg-orb login-bg-orb-3" />

      <div className="flex w-full max-w-sm flex-col gap-6 relative z-10">
        <div className="flex items-center gap-3 self-center font-semibold text-2xl text-white">
          <div className="flex size-9 items-center justify-center rounded-xl bg-white/10 backdrop-blur-md border border-white/20 text-white shadow-md">
            <svg width="22" height="22" viewBox="0 0 40 40" fill="none">
              <path d="M12 20L18 14L24 20L18 26L12 20Z" fill="white" opacity="0.9" />
              <path d="M18 14L24 20L30 14L24 8L18 14Z" fill="white" opacity="0.6" />
              <path d="M18 26L24 20L30 26L24 32L18 26Z" fill="white" opacity="0.6" />
            </svg>
          </div>
          YaraERP
        </div>
        <LoginForm />
      </div>
    </div>
  )
}
