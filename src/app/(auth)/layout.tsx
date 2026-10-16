import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { getSystemSettings } from "@/lib/utils/settings"
import { isInstalled } from "@/lib/setup/install-state"

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getSystemSettings()
  const brand = settings.companyName || "YaraERP"
  return {
    title: {
      template: `%s | ${brand}`,
      default: brand,
    },
  }
}

export default async function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // First run: no users exist yet, so login can never succeed — route to setup.
  if (!(await isInstalled())) {
    redirect("/setup")
  }
  return children
}
