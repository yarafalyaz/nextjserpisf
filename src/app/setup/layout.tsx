import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Penyiapan Awal",
  description: "Instalasi awal YaraERP",
}

export default function SetupLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-svh items-center justify-center bg-background p-4">
      <main id="konten-utama" tabIndex={-1} className="w-full max-w-2xl">{children}</main>
    </div>
  )
}
