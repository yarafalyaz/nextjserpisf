export const dynamic = "force-dynamic"

import { redirect } from "next/navigation"
import { isInstalled } from "@/lib/setup/install-state"
import { SetupForm } from "./_components/setup-form"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Setup Awal" }

export default async function SetupPage() {
  if (await isInstalled()) {
    redirect("/")
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1 text-center">
        <h1 className="text-2xl font-bold text-foreground">Setup Awal YaraERP</h1>
        <p className="text-sm text-muted-foreground">
          Database masih kosong. Lengkapi data di bawah untuk menyiapkan aplikasi dan akun
          administrator pertama.
        </p>
      </div>
      <SetupForm />
    </div>
  )
}
