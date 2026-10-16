/**
 * Baris alamat perusahaan untuk kop dokumen (laporan cetak, PDF transaksi, ekspor).
 *
 * Alamat di Pengaturan Perusahaan disimpan terpisah: `companyAddress` (jalan) dan
 * wilayah administratif `companyVillage` (desa/kelurahan), `companyDistrict`
 * (kecamatan), `companyCity` (kota/kabupaten), `companyProvince`, `companyPostalCode`.
 * Sebelumnya kop hanya merender `companyAddress` + kode pos, sehingga baris
 * Desa/Kecamatan/Kota/Provinsi tidak pernah muncul walau sudah diisi.
 *
 * Urutan mengikuti kebiasaan alamat Indonesia:
 *   Jl. Contoh No 35
 *   Kelurahan, Kecamatan, Kota Tangerang, Banten 15146
 */
export type CompanyAddressSource = {
  companyAddress?: string | null
  companyVillage?: string | null
  companyDistrict?: string | null
  companyCity?: string | null
  companyProvince?: string | null
  companyPostalCode?: string | null
}

const clean = (value?: string | null) => (value ?? "").replace(/\s+/g, " ").trim()

/** Baris kop dokumen: [jalan, wilayah] — baris kosong dibuang. */
export function companyAddressLines(settings: CompanyAddressSource): string[] {
  const street = clean(settings.companyAddress)
  const region = [
    clean(settings.companyVillage),
    clean(settings.companyDistrict),
    clean(settings.companyCity),
    clean(settings.companyProvince),
  ]
    .filter(Boolean)
    .join(", ")
  const regionWithPostal = [region, clean(settings.companyPostalCode)].filter(Boolean).join(" ")
  return [street, regionWithPostal].filter(Boolean)
}

/** Alamat dalam satu baris, untuk ruang sempit (tabel ekspor, kepak PDF). */
export function companyAddressOneLine(settings: CompanyAddressSource): string {
  return companyAddressLines(settings).join(", ")
}
