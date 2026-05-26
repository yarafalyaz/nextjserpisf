import Link from "next/link"

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] text-center">
      <p className="flex flex-col items-center justify-center min-h-[50vh] text-center-code">404</p>
      <h2 style={{ margin: "0 0 8px", fontSize: "1.25rem" }}>Halaman Tidak Ditemukan</h2>
      <p className="text-muted" style={{ marginBottom: "24px" }}>
        Halaman yang Anda cari tidak ada atau telah dipindahkan.
      </p>
      <Link href="/" className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all">
        Kembali ke Dashboard
      </Link>
    </div>
  )
}
