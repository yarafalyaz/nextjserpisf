import Link from "next/link"

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-surface rounded-xl border border-default shadow-sm p-6 text-center">
        <h1 className="text-4xl font-bold mb-2">404</h1>
        <h2 className="text-xl font-bold mb-2">Halaman Tidak Ditemukan</h2>
        <p className="text-muted-foreground mb-4">Halaman yang Anda cari tidak tersedia.</p>
        <Link href="/" className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground font-medium">
          Kembali ke Dashboard
        </Link>
      </div>
    </div>
  )
}
