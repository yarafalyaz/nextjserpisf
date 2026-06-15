import Link from "next/link"
import { Button } from "@/components/ui/shadcn/button"
import { Home } from "lucide-react"

export default function AuthNotFound() {
  return (
    <div className="w-full flex flex-col items-center justify-center space-y-6">
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Halaman Tidak Ditemukan</h1>
        <p className="text-sm text-muted-foreground">
          Tautan yang Anda buka tidak tersedia atau sudah dipindahkan.
        </p>
      </div>
      <Button asChild className="focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
        <Link href="/login" className="flex items-center gap-2" aria-label="Kembali ke halaman masuk">
          <Home className="h-4 w-4" />
          Kembali ke Halaman Masuk
        </Link>
      </Button>
    </div>
  )
}
