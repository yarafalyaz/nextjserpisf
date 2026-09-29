import { NextResponse } from "next/server"
import { getSystemSettings } from "@/lib/utils/settings"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const settings = await getSystemSettings()
    return NextResponse.json({
      companyName: settings.companyName,
      companyAddress: settings.companyAddress,
      companyPhone: settings.companyPhone,
      companyEmail: settings.companyEmail,
      companyWebsite: settings.companyWebsite,
      companyLogo: settings.companyLogo,
      companyPostalCode: settings.companyPostalCode,
    })
  } catch {
    return NextResponse.json({
      companyName: "Perusahaan",
      companyAddress: null,
      companyPhone: null,
      companyEmail: null,
      companyWebsite: null,
      companyLogo: null,
      companyPostalCode: null,
    })
  }
}
