import type { Metadata } from "next"
import { GalleryVerticalEnd } from "lucide-react"
import { Suspense } from "react"
import { LoginForm } from "@/components/login-form"
import { getSystemSettings } from "@/lib/utils/settings"
import { SafeImage } from "@/components/ui/safe-image"

export const dynamic = "force-dynamic"
export const metadata: Metadata = { title: "Login" }

export default async function LoginPage() {
  const settings = await getSystemSettings()

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 bg-muted p-6 md:p-10">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <div className="flex justify-center">
          {settings.companyLogo ? (
            <SafeImage
              src={settings.companyLogo}
              alt="Logo"
              width={192}
              height={192}
              priority
              className="size-48 object-contain"
            />
          ) : (
            <div className="flex size-48 items-center justify-center rounded-xl bg-zinc-900 text-zinc-50 dark:bg-zinc-50 dark:text-zinc-900">
              <GalleryVerticalEnd className="size-16" aria-hidden="true" />
            </div>
          )}
        </div>
        <Suspense fallback={<LoginFallback />}>
          <LoginForm />
        </Suspense>
      </div>
    </div>
  )
}

function LoginFallback() {
  return (
    <div
      role="status"
      aria-label="Memuat formulir masuk"
      aria-busy="true"
      className="flex flex-col gap-6 animate-pulse"
    >
      <div className="rounded-xl border border-default bg-surface shadow-sm">
        <div className="flex flex-col items-center gap-2 p-6 border-b border-default">
          <div className="h-6 w-44 bg-default/20 rounded" />
          <div className="h-4 w-56 bg-default/15 rounded" />
        </div>
        <div className="flex flex-col gap-4 p-6">
          <div className="flex flex-col gap-2">
            <div className="h-4 w-12 bg-default/20 rounded" />
            <div className="h-10 w-full bg-default/15 rounded-lg" />
          </div>
          <div className="flex flex-col gap-2">
            <div className="h-4 w-16 bg-default/20 rounded" />
            <div className="h-10 w-full bg-default/15 rounded-lg" />
          </div>
          <div className="h-9 w-full bg-default/20 rounded-lg" />
        </div>
      </div>
      <div className="h-4 w-72 bg-default/10 rounded mx-auto" />
    </div>
  )
}
