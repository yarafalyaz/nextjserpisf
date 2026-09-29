import type { Metadata } from "next"
import { getSystemSettings } from "@/lib/utils/settings"

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

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
