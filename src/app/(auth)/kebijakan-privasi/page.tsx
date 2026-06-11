import { ArrowLeft } from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/shadcn/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/shadcn/card"

export default function KebijakanPrivasiPage() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 bg-muted p-6 md:p-10">
      <div className="flex w-full max-w-2xl flex-col gap-6">
        <Link href="/login" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors self-start">
          <ArrowLeft size={16} /> Kembali ke Login
        </Link>
        <Card className="border border-default/40 shadow-xl bg-card/90 backdrop-blur-sm">
          <CardHeader className="border-b border-default pb-6">
            <CardTitle className="text-3xl font-bold tracking-tight text-foreground">Kebijakan Privasi</CardTitle>
            <CardDescription className="text-sm text-muted-foreground">
              Terakhir diperbarui: 11 Juni 2026
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-6 prose dark:prose-invert max-w-none text-foreground leading-relaxed flex flex-col gap-5">
            <section className="flex flex-col gap-2">
              <h2 className="text-lg font-semibold text-foreground">1. Informasi yang Kami Kumpulkan</h2>
              <p className="text-sm text-muted-foreground">
                Kami mengumpulkan data operasional bengkel, data pelanggan (nama, nomor telepon, email, alamat), data kendaraan, riwayat transaksi penjualan/pembelian, serta log aktivitas pengguna sistem demi kepentingan kelancaran operasional YaraERP.
              </p>
            </section>

            <section className="flex flex-col gap-2">
              <h2 className="text-lg font-semibold text-foreground">2. Penggunaan Informasi</h2>
              <p className="text-sm text-muted-foreground">
                Semua data yang kami kumpulkan digunakan secara eksklusif untuk memproses transaksi penjualan, mengelola persediaan suku cadang, mencatat data keuangan perusahaan Anda, dan meningkatkan efisiensi sistem YaraERP.
              </p>
            </section>

            <section className="flex flex-col gap-2">
              <h2 className="text-lg font-semibold text-foreground">3. Perlindungan Data</h2>
              <p className="text-sm text-muted-foreground">
                Kami menerapkan langkah-langkah keamanan teknis dan organisasional yang kuat untuk melindungi data perusahaan Anda dari akses yang tidak sah, perubahan, pengungkapan, atau penghancuran tanpa izin.
              </p>
            </section>

            <section className="flex flex-col gap-2">
              <h2 className="text-lg font-semibold text-foreground">4. Berbagi dengan Pihak Ketiga</h2>
              <p className="text-sm text-muted-foreground">
                YaraERP berkomitmen penuh untuk tidak menjual, menyewakan, atau membagikan data operasional atau data pribadi pelanggan Anda kepada pihak ketiga mana pun tanpa persetujuan eksplisit dari pihak Anda, kecuali diwajibkan oleh hukum negara.
              </p>
            </section>

            <section className="flex flex-col gap-2">
              <h2 className="text-lg font-semibold text-foreground">5. Hak Akses Data</h2>
              <p className="text-sm text-muted-foreground">
                Sebagai pemilik data, Anda memiliki hak penuh untuk mengakses, memperbarui, memodifikasi, atau meminta penghapusan informasi data tertentu yang tersimpan di dalam sistem YaraERP sesuai dengan kebijakan operasional Anda.
              </p>
            </section>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
