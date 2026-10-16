/**
 * Validasi tautan transaksi favorit.
 *
 * Favorit disimpan sebagai jalur internal aplikasi (mis.
 * `/penjualan/faktur/tambah`) dan dirender sebagai `<Link>`. Kalau nilai mentah
 * dari form dibiarkan, pengguna bisa menyimpan URL absolut/protokol-jarang
 * (`javascript:`, `https://…`, `//evil`) yang lalu tampil sebagai tautan di
 * dalam aplikasi. Penjaga ini fail-closed: hanya jalur yang diawali satu `/`
 * yang diterima.
 *
 * Pure (tanpa Prisma/DOM).
 */

export function normalizeFavoriteHref(raw: unknown): string | null {
  if (typeof raw !== "string") return null
  const href = raw.trim()
  if (!href.startsWith("/")) return null
  // `//host` adalah URL protokol-relatif, bukan jalur internal.
  if (href.startsWith("//")) return null
  if (href.includes("://")) return null
  // Spasi/kontrol membuka celah penyamaran tautan dan tidak pernah valid di path.
  if (/\s/.test(href)) return null
  return href
}
