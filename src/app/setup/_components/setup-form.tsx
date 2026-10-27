"use client"

import { useRouter } from "next/navigation"
import { useEffect, useRef, useState, useTransition } from "react"
import { CheckCircle2, Loader2, XCircle } from "lucide-react"
import { getSetupStatus, provisionSetupSchema, runSetup } from "@/actions/setup.actions"
import { showSuccess, showError } from "@/lib/utils/toast"
import { Label } from "@/components/ui/shadcn/label"
import { Input } from "@/components/ui/shadcn/input"
import { Textarea } from "@/components/ui/shadcn/textarea"
import { Button } from "@/components/ui/button"
import { AddressPicker } from "@/components/ui/address-picker"
import { FormCard, FormSection, FormActions } from "@/components/ui/form-section"
import type { SetupChecks } from "@/lib/setup/provision"

const STEPS = ["Selamat Datang", "Pemeriksaan Sistem", "Data Perusahaan", "Akun Administrator"]

type Status = Awaited<ReturnType<typeof getSetupStatus>>

function CheckRow({
  label,
  ok,
  loading,
  detail,
}: {
  label: string
  ok: boolean | null
  loading: boolean
  detail: string
}) {
  return (
    <div className="flex items-start gap-3">
      {loading || ok === null ? (
        <Loader2 aria-hidden="true" className="mt-0.5 size-5 shrink-0 animate-spin text-muted-foreground" />
      ) : ok ? (
        <CheckCircle2 aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-emerald-600" />
      ) : (
        <XCircle aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-danger" />
      )}
      <div className="flex flex-col">
        <span className="text-sm font-medium text-foreground">{label}</span>
        <span className="text-sm text-muted-foreground">{detail}</span>
      </div>
    </div>
  )
}

export function SetupForm() {
  const router = useRouter()
  const formRef = useRef<HTMLFormElement>(null)
  const [step, setStep] = useState(0)
  const [status, setStatus] = useState<Status | null>(null)
  const [statusLoading, setStatusLoading] = useState(true)
  const [provError, setProvError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<{ email: string; redirectTo: string } | null>(null)
  const [isPending, startTransition] = useTransition()
  const [isProvisioning, startProvision] = useTransition()

  async function refreshStatus() {
    setStatusLoading(true)
    try {
      const s = await getSetupStatus()
      setStatus(s)
    } catch {
      setStatus({ installed: false, checks: null })
    } finally {
      setStatusLoading(false)
    }
  }

  useEffect(() => {
    let cancelled = false
    async function loadStatus() {
      try {
        const s = await getSetupStatus()
        if (!cancelled) setStatus(s)
      } catch {
        if (!cancelled) setStatus({ installed: false, checks: null })
      } finally {
        if (!cancelled) setStatusLoading(false)
      }
    }
    void loadStatus()
    return () => {
      cancelled = true
    }
  }, [])

  const checks: SetupChecks | null = status?.checks ?? null
  const schemaReady = checks?.schemaReady === true

  function fieldValue(name: string): string {
    if (!formRef.current) return ""
    return String(new FormData(formRef.current).get(name) ?? "").trim()
  }

  function goNext() {
    setError(null)
    if (step === 2) {
      if (!fieldValue("companyName")) {
        setError("Nama perusahaan wajib diisi")
        return
      }
      const email = fieldValue("companyEmail")
      if (email && !email.includes("@")) {
        setError("Email perusahaan tidak valid")
        return
      }
    }
    setStep((s) => Math.min(s + 1, STEPS.length - 1))
  }

  function onProvision() {
    setProvError(null)
    startProvision(async () => {
      try {
        const result = await provisionSetupSchema()
        if (result.checks) setStatus({ installed: false, checks: result.checks })
        if (!result.success) {
          setProvError(result.error ?? "Gagal menyiapkan skema database")
        }
      } catch (err) {
        setProvError(err instanceof Error ? err.message : "Gagal menyiapkan skema database")
      }
    })
  }

  function onSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)

    if (!fieldValue("adminName")) return setError("Nama administrator wajib diisi")
    const adminEmail = fieldValue("adminEmail")
    if (!adminEmail || !adminEmail.includes("@")) return setError("Email administrator tidak valid")
    const password = fieldValue("adminPassword")
    if (password.length < 12) return setError("Kata sandi minimal 12 karakter")
    if (password !== fieldValue("confirmPassword")) return setError("Konfirmasi kata sandi tidak cocok")

    const formData = new FormData(e.currentTarget)
    startTransition(async () => {
      try {
        const result = await runSetup(formData)
        if (!result?.success) {
          setError(result?.error ?? "Instalasi gagal")
          showError(result?.error ?? "Instalasi gagal")
          return
        }
        showSuccess("Instalasi selesai. Lanjutkan penyelesaian pengaturan.")
        const redirectTo = result.redirectTo ?? "/login?setup=done"
        setDone({ email: result.email ?? adminEmail, redirectTo })
        // Langsung arahkan ke tujuan pasca-install. Tanpa ini, render ulang
        // /setup setelah action melihat aplikasi sudah terpasang dan
        // me-redirect ke dasbor — layar sukses di bawah hanya cadangan
        // bila navigasi ini tertahan.
        router.push(redirectTo)
      } catch (err) {
        const message = err instanceof Error ? err.message : "Instalasi gagal"
        setError(message)
        showError(message)
      }
    })
  }

  if (done) {
    return (
      <FormCard>
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <CheckCircle2 aria-hidden="true" className="size-12 text-emerald-600" />
          <h2 className="text-xl font-semibold text-foreground">Instalasi Selesai</h2>
          <p className="max-w-md text-sm text-muted-foreground">
            YaraERP sudah terpasang dengan data master bawaan (peran dan hak akses, bagan akun,
            satuan, metode pembayaran). Akun administrator <strong>{done.email}</strong> sudah
            dibuat dan masuk. Lanjutkan ke penyelesaian pengaturan untuk melengkapi profil
            perusahaan.
          </p>
          <Button
            type="button"
            variant="primary"
            onClick={() => {
              router.push(done.redirectTo)
              router.refresh()
            }}
          >
            Masuk ke Aplikasi
          </Button>
        </div>
      </FormCard>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <ol className="flex items-center justify-center gap-2" aria-label="Langkah penyiapan">
        {STEPS.map((label, i) => (
          <li key={label} className="flex items-center gap-2">
            <span
              className={
                i < step
                  ? "flex size-7 items-center justify-center rounded-full bg-emerald-600 text-xs font-semibold text-white"
                  : i === step
                    ? "flex size-7 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground"
                    : "flex size-7 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground"
              }
              aria-current={i === step ? "step" : undefined}
            >
              {i < step ? "✓" : i + 1}
            </span>
            <span className={i === step ? "text-sm font-medium text-foreground" : "hidden text-sm text-muted-foreground sm:block"}>
              {label}
            </span>
            {i < STEPS.length - 1 ? <span aria-hidden="true" className="mx-1 h-px w-6 bg-border" /> : null}
          </li>
        ))}
      </ol>

      <form ref={formRef} onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <div className={step === 0 ? "" : "hidden"}>
          <FormCard>
            <FormSection
              title="Selamat Datang di YaraERP"
              description="Wizard ini menyiapkan aplikasi dalam beberapa langkah singkat."
            >
              <div className="flex flex-col gap-2 text-sm text-muted-foreground sm:col-span-2">
                <p>
                  Database akan diperiksa dan — bila masih kosong — skemanya dibuat otomatis
                  dari migrasi aplikasi. Setelah itu Anda mengisi identitas perusahaan dan
                  membuat akun administrator pertama; data master bawaan (peran &amp; hak
                  akses RBAC, bagan akun, satuan, metode pembayaran, gudang utama) langsung
                  terisi, tanpa data contoh.
                </p>
                <p>
                  Koneksi database diatur lewat konfigurasi server (<code>DATABASE_URL</code>),
                  bukan dari wizard ini. Pastikan variabel itu sudah menunjuk ke database
                  yang benar sebelum melanjutkan.
                </p>
              </div>
            </FormSection>
            <FormActions>
              <Button type="button" variant="primary" onClick={() => setStep(1)}>
                Mulai Penyiapan
              </Button>
            </FormActions>
          </FormCard>
        </div>

        <div className={step === 1 ? "" : "hidden"}>
          <FormCard>
            <FormSection
              title="Pemeriksaan Sistem"
              description="Wizard memeriksa koneksi database dan kesiapan skema sebelum data diisi."
            >
              <div className="flex flex-col gap-4 sm:col-span-2">
                <CheckRow
                  label="Koneksi database"
                  ok={statusLoading ? null : (checks?.databaseConnected ?? false)}
                  loading={statusLoading}
                  detail={
                    statusLoading
                      ? "Memeriksa…"
                      : checks?.databaseConnected
                        ? "Terhubung ke database dari konfigurasi server (DATABASE_URL)."
                        : "Tidak terjangkau. Periksa DATABASE_URL dan status server database, lalu periksa ulang."
                  }
                />
                <CheckRow
                  label="Skema database"
                  ok={statusLoading ? null : schemaReady}
                  loading={statusLoading}
                  detail={
                    statusLoading
                      ? "Memeriksa…"
                      : schemaReady
                        ? `${checks?.tableCount ?? 0} tabel ditemukan — skema siap dipakai.`
                        : checks?.databaseConnected
                          ? "Tabel aplikasi belum terbentuk. Buat otomatis dari migrasi aplikasi dengan tombol di bawah."
                          : "Belum bisa diperiksa sampai koneksi database hidup."
                  }
                />
                {provError ? (
                  <p role="alert" className="text-sm whitespace-pre-wrap text-danger">
                    {provError}
                  </p>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="secondary" isDisabled={statusLoading} onClick={refreshStatus}>
                    Periksa Ulang
                  </Button>
                  {checks?.databaseConnected && !schemaReady ? (
                    <Button type="button" variant="primary" isDisabled={isProvisioning} isPending={isProvisioning} onClick={onProvision}>
                      {isProvisioning ? "Membuat Skema…" : "Buat Skema Database"}
                    </Button>
                  ) : null}
                </div>
              </div>
            </FormSection>
            <FormActions>
              <Button type="button" variant="secondary" onClick={() => setStep(0)}>
                Kembali
              </Button>
              <Button type="button" variant="primary" isDisabled={!schemaReady} onClick={goNext}>
                Lanjut
              </Button>
            </FormActions>
          </FormCard>
        </div>

        <div className={step === 2 ? "" : "hidden"}>
          <FormCard>
            <FormSection
              title="Data Perusahaan"
              description="Identitas ini dipakai pada kop laporan dan judul aplikasi."
            >
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="companyName">Nama Perusahaan *</Label>
                <Input id="companyName" name="companyName" placeholder="mis. PT Sumber Makmur" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="companyPhone">Telepon</Label>
                <Input
                  id="companyPhone"
                  name="companyPhone"
                  type="tel"
                  inputMode="tel"
                  placeholder="mis. 021-1234567"
                  onInput={(e) => {
                    // Nomor telepon hanya angka dan tanda baca telepon —
                    // huruf disaring langsung saat mengetik (server juga menolak).
                    e.currentTarget.value = e.currentTarget.value.replace(/[^0-9+\-\s()]/g, "")
                  }}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="companyEmail">Email Perusahaan</Label>
                <Input id="companyEmail" name="companyEmail" type="email" placeholder="info@perusahaan.com" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="companyWebsite">Website</Label>
                <Input id="companyWebsite" name="companyWebsite" placeholder="https://..." />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="companyTaxId">NPWP</Label>
                <Input id="companyTaxId" name="companyTaxId" placeholder="XX.XXX.XXX.X-XXX.XXX" />
              </div>
              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <Label htmlFor="companyAddress">Alamat</Label>
                <Textarea id="companyAddress" name="companyAddress" rows={2} placeholder="Alamat lengkap" />
              </div>
              <div className="col-span-full">
                <AddressPicker prefix="company" />
              </div>
            </FormSection>
            <FormActions>
              <Button type="button" variant="secondary" onClick={() => setStep(1)}>
                Kembali
              </Button>
              <Button type="button" variant="primary" onClick={goNext}>
                Lanjut
              </Button>
            </FormActions>
          </FormCard>
        </div>

        <div className={step === 3 ? "" : "hidden"}>
          <FormCard>
            <FormSection
              title="Akun Administrator"
              description="Akun ini akan menjadi super admin dengan akses penuh."
            >
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="adminName">Nama Administrator *</Label>
                <Input id="adminName" name="adminName" placeholder="mis. Budi Santoso" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="adminEmail">Email *</Label>
                <Input id="adminEmail" name="adminEmail" type="email" placeholder="admin@perusahaan.com" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="adminPassword">Kata Sandi *</Label>
                <Input id="adminPassword" name="adminPassword" type="password" placeholder="Minimal 12 karakter" required minLength={12} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="confirmPassword">Konfirmasi Kata Sandi *</Label>
                <Input id="confirmPassword" name="confirmPassword" type="password" />
              </div>
            </FormSection>

            {error ? (
              <p role="alert" className="text-sm text-danger">
                {error}
              </p>
            ) : null}

            <FormActions>
              <Button type="button" variant="secondary" isDisabled={isPending} onClick={() => setStep(2)}>
                Kembali
              </Button>
              <Button type="submit" variant="primary" isDisabled={isPending} isPending={isPending}>
                {isPending ? "Menyiapkan..." : "Install Sekarang"}
              </Button>
            </FormActions>
          </FormCard>
        </div>

        {step < 3 && error ? (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        ) : null}
      </form>
    </div>
  )
}
