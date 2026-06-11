import { GalleryVerticalEnd } from "lucide-react"
import { LoginForm } from "@/components/login-form"
import { getSystemSettings } from "@/lib/utils/settings"
import { SafeImage } from "@/components/ui/safe-image"

export default async function LoginPage() {
  const settings = await getSystemSettings()

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 bg-muted p-6 md:p-10">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <div className="flex items-center gap-2 self-center font-medium">
          {settings.companyLogo ? (
            <SafeImage
              src={settings.companyLogo}
              alt={settings.companyName || "Logo"}
              width={24}
              height={24}
              priority
              className="size-6 object-contain"
            />
          ) : (
            <div className="flex size-6 items-center justify-center rounded-md bg-zinc-900 text-zinc-50 dark:bg-zinc-50 dark:text-zinc-900">
              <GalleryVerticalEnd className="size-4" />
            </div>
          )}
          <span>{settings.companyName || "Silengkap"}</span>
        </div>
        <LoginForm />
      </div>
    </div>
  )
}
