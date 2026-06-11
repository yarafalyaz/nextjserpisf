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

export default function KetentuanLayananPage() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 bg-muted p-6 md:p-10">
      <div className="flex w-full max-w-2xl flex-col gap-6">
        <Link href="/login" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors self-start">
          <ArrowLeft size={16} /> Kembali ke Login
        </Link>
        <Card className="border border-default/40 shadow-xl bg-card/90 backdrop-blur-sm">
          <CardHeader className="border-b border-default pb-6">
            <CardTitle className="text-3xl font-bold tracking-tight text-foreground">Ketentuan Layanan</CardTitle>
            <CardDescription className="text-sm text-muted-foreground">
              Terakhir diperbarui: 11 Juni 2026
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-6 prose dark:prose-invert max-w-none text-foreground leading-relaxed flex flex-col gap-5">
            <section className="flex flex-col gap-2">
              <h2 className="text-lg font-semibold text-foreground">1. Penerimaan Ketentuan</h2>
              <p className="text-sm text-muted-foreground">
                Dengan mengakses dan menggunakan sistem YaraERP, Anda menyetujui untuk terikat oleh Ketentuan Layanan ini. Jika Anda tidak menyetujui salah satu ketentuan di sini, Anda tidak diperkenankan untuk menggunakan sistem.
              </p>
            </section>

            <section className="flex flex-col gap-2">
              <h2 className="text-lg font-semibold text-foreground">2. Penggunaan Lisensi Sistem</h2>
              <p className="text-sm text-muted-foreground">
                YaraERP memberikan hak lisensi terbatas, non-eksklusif, dan tidak dapat dipindahtangankan kepada Anda untuk mengakses sistem guna mengelola operasi internal perusahaan Anda sesuai dengan paket langganan atau lisensi yang disepakati.
              </p>
            </section>

            <section className="flex flex-col gap-2">
              <h2 className="text-lg font-semibold text-foreground">3. Keamanan Akun dan Kata Sandi</h2>
              <p className="text-sm text-muted-foreground">
                Anda bertanggung jawab sepenuhnya untuk menjaga kerahasiaan kredensial login (email dan password) akun Anda. Segala bentuk aktivitas yang terjadi di bawah akun Anda merupakan tanggung jawab Anda sepenuhnya.
              </p>
            </section>

            <section className="flex flex-col gap-2">
              <h2 className="text-lg font-semibold text-foreground">4. Pembatasan Tanggung Jawab</h2>
              <p className="text-sm text-muted-foreground">
                YaraERP disediakan "sebagaimana adanya" tanpa jaminan dalam bentuk apa pun. Kami tidak bertanggung jawab atas kerugian materiil, kehilangan data, atau gangguan bisnis yang disebabkan oleh penggunaan atau ketidakmampuan menggunakan sistem ini.
              </p>
            </section>

            <section className="flex flex-col gap-2">
              <h2 className="text-lg font-semibold text-foreground">5. Perubahan Ketentuan</h2>
              <p className="text-sm text-muted-foreground">
                Kami berhak untuk mengubah atau memperbarui Ketentuan Layanan ini sewaktu-waktu. Perubahan akan berlaku segera setelah dipublikasikan pada halaman ini.
              </p>
            </section>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
