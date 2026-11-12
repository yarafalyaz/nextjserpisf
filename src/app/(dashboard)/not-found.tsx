import Link from "next/link"

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] text-center">
      <p className="text-6xl font-bold text-muted-foreground/40 mb-2">404</p>
      <h2 className="m-0 mb-2 text-xl">Halaman Tidak Ditemukan</h2>
      <p className="text-muted-foreground mb-6">
        Halaman yang Anda cari tidak ada atau telah dipindahkan.
      </p>
      <Link href="/" className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 min-h-11 sm:min-h-9 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-2xs cursor-pointer">
        Kembali ke Dasbor
      </Link>
    </div>
  )
}
