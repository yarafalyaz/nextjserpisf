/**
 * Deteksi "permintaan ini datang dari aplikasi sendiri?" untuk dipakai di
 * middleware (Edge runtime) — karena itu modul ini tidak boleh mengimpor
 * `next/headers` (dipakai `csrf.ts`, yang khusus server action).
 *
 * Kebutuhan konkretnya: `GET /login?reason=…` menghapus cookie sesi agar
 * pengguna yang dinonaktifkan tidak terjebak loop redirect. Tanpa penjagaan,
 * tautan lintas-situs `…/login?reason=apa pun` yang diklik korban akan
 * mengeluarkannya dari sesi (logout CSRF). Karena itu penghapusan cookie hanya
 * boleh terjadi pada navigasi yang berasal dari aplikasi.
 *
 * Urutan pemeriksaan:
 *   1. `Sec-Fetch-Site` — dikirim semua browser modern; `same-origin` (navigasi
 *      di dalam aplikasi, termasuk rantai redirect internal) dan `none`
 *      (alamat diketik / bookmark) dianggap berasal dari aplikasi.
 *   2. Fallback browser lama: host pada `Origin`/`Referer` harus sama dengan
 *      host permintaan.
 *   3. Tidak ada bukti apa pun → false (fail-closed: lebih baik tidak menghapus
 *      cookie daripada menghapusnya atas permintaan pihak lain).
 */
export function isSameOriginRequest(req: {
  headers: { get(name: string): string | null }
}): boolean {
  const site = req.headers.get("sec-fetch-site")
  if (site) {
    const normalized = site.trim().toLowerCase()
    return normalized === "same-origin" || normalized === "none"
  }

  const host = req.headers.get("host")
  if (!host) return false

  const source = req.headers.get("origin") ?? req.headers.get("referer")
  if (!source) return false

  try {
    return new URL(source).host === host
  } catch {
    return false
  }
}
