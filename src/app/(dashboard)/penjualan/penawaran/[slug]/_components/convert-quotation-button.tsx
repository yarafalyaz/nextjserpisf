"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { ShoppingCart } from "lucide-react"
import { convertQuotationToOrder } from "@/actions/sales.actions"
import { showError, showSuccess } from "@/lib/utils/toast"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"

/**
 * Konversi penawaran diterima/dis­etujui menjadi Pesanan Penjualan langsung
 * (convertQuotationToOrder). Halaman hanya menampilkan tombol ini saat
 * kondisi guard server terpenuhi (status accepted/approved, belum lewat
 * validUntil, belum ada pesanan tertaut) dan pemanggil berizin
 * create_sales_orders; server tetap penjaga otoritatif (status, expiry,
 * approval workflow, gerbang kredit, idempotensi baris terkunci).
 * Sukses membawa ke detail pesanan hasil (id dikembalikan aksi; detail
 * pesanan menerima slug atau id).
 */
export function ConvertQuotationButton({ quotationId }: { quotationId: number }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [isOpen, setIsOpen] = useState(false)

  function handleConvert() {
    startTransition(async () => {
      const result = await convertQuotationToOrder(quotationId)
      if (!result.success) {
        showError(result.error || "Gagal mengonversi penawaran")
        return
      }
      showSuccess("Penawaran dikonversi menjadi Pesanan Penjualan")
      setIsOpen(false)
      if (result.id) {
        router.push(`/penjualan/pesanan/${result.id}`)
      } else {
        router.refresh()
      }
    })
  }

  return (
    <>
      <Button variant="primary" onPress={() => setIsOpen(true)} isDisabled={isPending}>
        <ShoppingCart size={14} aria-hidden="true" /> Konversi ke Pesanan
      </Button>
      <ConfirmDialog
        isOpen={isOpen}
        onOpenChange={setIsOpen}
        title="Konversi penawaran menjadi Pesanan Penjualan?"
        body="Pesanan Penjualan draf dibuat dari isi penawaran ini dan penawaran ditandai terkonversi. Tindakan ini tidak dapat dibatalkan."
        confirmLabel="Konversi"
        cancelLabel="Batal"
        variant="primary"
        isPending={isPending}
        onConfirm={handleConvert}
      />
    </>
  )
}
