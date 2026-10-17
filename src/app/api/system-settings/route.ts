import { NextResponse } from "next/server"
import { getSystemSettings } from "@/lib/utils/settings"
import { hasPermission } from "@/lib/auth/permissions"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    // Identitas perusahaan dipakai kop laporan & PDF ekspor — semua pengguna yang
    // boleh membuka dasbor/laporan boleh membacanya, tapi endpoint ini tidak boleh
    // terbuka begitu saja (sebelumnya cukup punya sesi, tanpa cek izin apa pun).
    if (!(await hasPermission("view_dashboard"))) {
      return NextResponse.json({ error: "Tidak memiliki izin" }, { status: 403 })
    }

    const settings = await getSystemSettings()
    return NextResponse.json({
      companyName: settings.companyName,
      companyAddress: settings.companyAddress,
      companyVillage: settings.companyVillage,
      companyDistrict: settings.companyDistrict,
      companyCity: settings.companyCity,
      companyProvince: settings.companyProvince,
      companyPhone: settings.companyPhone,
      companyEmail: settings.companyEmail,
      companyWebsite: settings.companyWebsite,
      companyLogo: settings.companyLogo,
      companyPostalCode: settings.companyPostalCode,
    })
  } catch (error) {
    // Jangan balas 200 berisi identitas palsu: konsumennya memakainya sebagai
    // kop PDF, sehingga laporan tampak sah padahal setelannya gagal dibaca.
    console.error("[api/system-settings] gagal memuat pengaturan:", error)
    return NextResponse.json(
      { error: "Gagal memuat pengaturan sistem" },
      { status: 500 }
    )
  }
}
