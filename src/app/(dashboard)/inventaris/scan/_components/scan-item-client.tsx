"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition, useEffect, useRef } from "react"
import { ScanLine } from "@/components/ui/fontawesome-icons"
import { lookupItemByScan } from "@/actions/master.actions"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { Label } from "@/components/ui/shadcn/label"
import { Input } from "@/components/ui/shadcn/input"
import { Button } from "@/components/ui/button"
import { showError } from "@/lib/utils/toast"
import { runUiAction } from "@/components/ui/async-action"


export default function ScanItemPage() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [code, setCode] = useState("")
  const [notFound, setNotFound] = useState<string | null>(null)
  const autoRan = useRef(false)

  function resolve(value: string) {
    const v = value.trim()
    if (!v) return
    setNotFound(null)
    startTransition(async () => {
      await runUiAction(async () => {
        const res = await lookupItemByScan(v)
        if (res.success && (res.slug || res.id)) {
          router.push(`/master/barang/${res.slug ?? res.id}`)
        } else {
          setNotFound(res.error || "Barang tidak ditemukan")
          showError(res.error || "Barang tidak ditemukan")
          setCode("")
        }
      }, "Gagal mencari barang")
    })
  }

  // Auto-resolve when opened from a QR link (?code=...)
  useEffect(() => {
    if (autoRan.current) return
    autoRan.current = true
    const param = new URLSearchParams(window.location.search).get("code")
    if (!param) return
    startTransition(async () => {
      await runUiAction(async () => {
        const res = await lookupItemByScan(param)
        if (res.success && (res.slug || res.id)) {
          router.push(`/master/barang/${res.slug ?? res.id}`)
        } else {
          setNotFound(res.error || "Barang tidak ditemukan")
          showError(res.error || "Barang tidak ditemukan")
        }
      }, "Gagal mencari barang")
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function submit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault()
    resolve(code)
  }

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
        { label: "Dasbor", href: "/" },
        { label: "Inventaris", href: "/inventaris" },
        { label: "Pindai Barang" },
      ]} />
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">Pindai Barang</h1>
      </div>

      <div className="flex justify-center pt-4">
        <div className="bg-surface rounded-lg border border-default shadow-2xs p-8 w-full max-w-2xl">
          <div className="flex flex-col items-center gap-5 py-6">
            <div className="flex size-20 items-center justify-center rounded-full bg-primary/10 text-primary">
              <ScanLine aria-hidden="true" className="size-10" />
            </div>
            <p className="text-base text-muted-foreground text-center max-w-md">
              Pindai barcode barang atau ketik <strong>barcode</strong> / <strong>SKU</strong>, lalu tekan Enter.
              Sistem akan membuka detail barang beserta lokasi (gudang/rak/baris) dan riwayat aktivitasnya.
            </p>
            <form onSubmit={submit} className="w-full flex flex-col gap-4 mt-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="scan-code">Barcode / SKU</Label>
                <Input
                  id="scan-code"
                  autoFocus
                  placeholder="Pindai atau ketik di sini..."
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  className="text-center font-mono text-xl tracking-wider h-14"
                />
              </div>
              {notFound && <p className="text-sm text-danger text-center">{notFound}</p>}
              <Button type="submit" variant="primary" isDisabled={isPending} className="h-12 text-base">
                {isPending ? "Mencari..." : "Buka Detail Barang"}
              </Button>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}
