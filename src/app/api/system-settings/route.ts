import { NextResponse } from "next/server"
import { getSystemSettings } from "@/lib/utils/settings"
import { auth } from "@/lib/auth/auth"
import { hasPermission } from "@/lib/auth/permissions"
import { apiError } from "@/lib/api-response"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    // Identitas perusahaan dipakai kop laporan & PDF ekspor — semua pengguna yang
    // boleh membuka dasbor/laporan boleh membacanya, tapi endpoint ini tidak boleh
    // terbuka begitu saja (sebelumnya cukup punya sesi, tanpa cek izin apa pun).
    if (!(await hasPermission("view_dashboard"))) {
      return apiError("FORBIDDEN", "Tidak memiliki izin")
    }

    // Nama pencetak untuk footer PDF klien (sejajar `printedBy` PDF server di
    // /api/pdf + ReportLetterhead): nama sesi, jatuh ke email, null bila tanpa
    // keduanya. Gerbang view_dashboard di atas sudah memastikan pemanggil
    // berizin, jadi ini nama milik pemanggil sendiri — bukan data orang lain.
    // Pola sama dipakai /api/pdf (auth() lalu hasPermission()).
    const session = await auth()
    const printedBy = session?.user?.name ?? session?.user?.email ?? null

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
      printedBy,
    })
  } catch (error) {
    // Jangan balas 200 berisi identitas palsu: konsumennya memakainya sebagai
    // kop PDF, sehingga laporan tampak sah padahal setelannya gagal dibaca.
    console.error("[api/system-settings] gagal memuat pengaturan:", error)
    return apiError("INTERNAL_ERROR", "Gagal memuat pengaturan sistem")
  }
}
