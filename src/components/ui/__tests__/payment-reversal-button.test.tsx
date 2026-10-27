// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest"
import { act } from "react"

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}))

vi.mock("@/actions/purchase.actions", () => ({
  reverseVendorPayment: vi.fn(async () => ({ success: true, id: 7, replayed: false })),
}))

vi.mock("@/actions/sales.actions", () => ({
  reverseSalesPayment: vi.fn(async () => ({ success: true, id: 9, replayed: false })),
}))

vi.mock("@/lib/utils/toast", () => ({ showError: vi.fn(), showSuccess: vi.fn() }))

import {
  HideWhenReversed,
  PaymentReversalButton,
  PaymentReversalNotice,
  ReversedOrForm,
} from "../payment-reversal-button"
import { reverseVendorPayment } from "@/actions/purchase.actions"
import { reverseSalesPayment } from "@/actions/sales.actions"
import { showError, showSuccess } from "@/lib/utils/toast"
import {
  renderCard,
  unmountCard,
  clearRenderedCards,
  setFieldValue,
} from "@/components/reports/__tests__/card-test-utils"

afterEach(() => {
  clearRenderedCards()
  vi.clearAllMocks()
})

function openDialog(container: HTMLElement, label: string) {
  const btn = container.querySelector(`[aria-label="${label}"]`) as HTMLButtonElement | null
  expect(btn).not.toBeNull()
  act(() => {
    btn!.click()
  })
}

async function confirmWithReason(kind: "vendor" | "sales", id: number, rawReason: string) {
  await vi.waitFor(() => {
    expect(document.body.querySelector(`#payment-reversal-reason-${kind}-${id}`)).not.toBeNull()
  })
  act(() => {
    setFieldValue(document.body, `#payment-reversal-reason-${kind}-${id}`, rawReason)
  })
  const confirm = [...document.body.querySelectorAll("button")].find(
    (b) => b.textContent === "Ya, Balikkan",
  )
  expect(confirm).toBeDefined()
  act(() => {
    confirm!.click()
  })
}

describe("PaymentReversalButton FIN-BR-008 (UI reversal pembayaran)", () => {
  it("pintu tampil: vendor hanya completed, sales selain reversed, keduanya butuh izin", () => {
    const vendor = renderCard(
      <PaymentReversalButton kind="vendor" id={7} documentNo="VP-0007" status="completed" canReverse />,
    )
    expect(vendor.container.querySelector('[aria-label="Balikkan pembayaran VP-0007"]')).not.toBeNull()
    unmountCard(vendor.root)

    const sales = renderCard(
      <PaymentReversalButton kind="sales" id={9} documentNo="SP-0009" status="posted" canReverse />,
    )
    expect(sales.container.querySelector('[aria-label="Balikkan pembayaran SP-0009"]')).not.toBeNull()
    unmountCard(sales.root)

    for (const node of [
      <PaymentReversalButton key="v-draft" kind="vendor" id={7} documentNo="VP-0007" status="draft" canReverse />,
      <PaymentReversalButton key="v-rev" kind="vendor" id={7} documentNo="VP-0007" status="reversed" canReverse />,
      <PaymentReversalButton key="s-rev" kind="sales" id={9} documentNo="SP-0009" status="reversed" canReverse />,
      <PaymentReversalButton key="v-no" kind="vendor" id={7} documentNo="VP-0007" status="completed" canReverse={false} />,
      <PaymentReversalButton key="s-no" kind="sales" id={9} documentNo="SP-0009" status="posted" canReverse={false} />,
    ]) {
      const r = renderCard(node)
      expect(r.container.textContent ?? "").not.toContain("Balikkan Pembayaran")
      unmountCard(r.root)
    }
  })

  it.each([
    {
      kind: "vendor" as const,
      id: 7,
      documentNo: "VP-0007",
      status: "completed",
      rawReason: "  Salah nominal transfer  ",
      trimmedReason: "Salah nominal transfer",
      success: "Pembayaran pemasok dibalik. Saldo tagihan kembali.",
    },
    {
      kind: "sales" as const,
      id: 9,
      documentNo: "SP-0009",
      status: "posted",
      rawReason: "  Double input penerimaan  ",
      trimmedReason: "Double input penerimaan",
      success: "Pembayaran penjualan dibalik. Piutang faktur kembali.",
    },
  ])(
    "konfirmasi $kind: aksi kind sendiri 1x (id, alasan trim, kunci idempotensi), aksi lawan 0x",
    async (c) => {
      const { container, root } = renderCard(
        <PaymentReversalButton
          kind={c.kind}
          id={c.id}
          documentNo={c.documentNo}
          status={c.status}
          canReverse
        />,
      )
      openDialog(container, `Balikkan pembayaran ${c.documentNo}`)
      await confirmWithReason(c.kind, c.id, c.rawReason)
      const own = c.kind === "vendor" ? reverseVendorPayment : reverseSalesPayment
      const other = c.kind === "vendor" ? reverseSalesPayment : reverseVendorPayment
      await vi.waitFor(() => {
        expect(own).toHaveBeenCalledTimes(1)
      })
      const call = vi.mocked(own).mock.calls[0] as unknown as [number, string, string]
      expect(call[0]).toBe(c.id)
      expect(call[1]).toBe(c.trimmedReason)
      expect(typeof call[2]).toBe("string")
      expect(call[2].length).toBeGreaterThan(0)
      expect(other).not.toHaveBeenCalled()
      expect(showSuccess).toHaveBeenCalledWith(c.success)
      unmountCard(root)
    },
  )

  it("alasan kosong/spasi ditolak di UI: aksi server tidak dipanggil", async () => {
    const { container, root } = renderCard(
      <PaymentReversalButton kind="vendor" id={7} documentNo="VP-0007" status="completed" canReverse />,
    )
    openDialog(container, "Balikkan pembayaran VP-0007")
    await confirmWithReason("vendor", 7, "   ")
    expect(reverseVendorPayment).not.toHaveBeenCalled()
    expect(reverseSalesPayment).not.toHaveBeenCalled()
    expect(showError).toHaveBeenCalledWith("Alasan pembalikan pembayaran wajib diisi.")
    unmountCard(root)
  })

  it("error server tampil verbatim lewat toast", async () => {
    vi.mocked(reverseSalesPayment).mockResolvedValueOnce({
      success: false,
      error: "Pembayaran ini memiliki bukti potong aktif (PPh 23). Batalkan bukti potong terlebih dahulu sebelum membalik pembayaran.",
    } as never)
    const { container, root } = renderCard(
      <PaymentReversalButton kind="sales" id={9} documentNo="SP-0009" status="posted" canReverse />,
    )
    openDialog(container, "Balikkan pembayaran SP-0009")
    await confirmWithReason("sales", 9, "Koreksi penerimaan")
    await vi.waitFor(() => {
      expect(showError).toHaveBeenCalledWith(
        "Pembayaran ini memiliki bukti potong aktif (PPh 23). Batalkan bukti potong terlebih dahulu sebelum membalik pembayaran.",
      )
    })
    unmountCard(root)
  })
})

describe("PaymentReversalNotice FIN-BR-008 (read-only reversed)", () => {
  it("reversed: alasan + tanggal verbatim tampil; status lain kosong", () => {
    const r = renderCard(
      <PaymentReversalNotice
        status="reversed"
        reversalReason="Salah nominal transfer"
        reversedAt="2026-10-28T03:00:00.000Z"
      />,
    )
    const notice = r.container.querySelector('[aria-label="Pembayaran sudah dibalik"]')
    expect(notice).not.toBeNull()
    expect(r.container.textContent).toContain("Pembayaran ini sudah dibalik (read-only).")
    expect(r.container.textContent).toContain("Salah nominal transfer")
    expect(r.container.textContent).toContain("28 Oktober 2026")
    unmountCard(r.root)

    for (const status of ["posted", "completed", "draft"]) {
      const other = renderCard(
        <PaymentReversalNotice key={status} status={status} reversalReason="X" reversedAt="2026-10-28" />,
      )
      expect(other.container.textContent ?? "").not.toContain("sudah dibalik")
      unmountCard(other.root)
    }
  })

  it("reversed tanpa alasan/tanggal: penanda tetap tampil, tidak mengarang histori", () => {
    const r = renderCard(<PaymentReversalNotice status="reversed" />)
    expect(r.container.textContent).toContain("Pembayaran ini sudah dibalik (read-only).")
    expect(r.container.textContent).not.toContain("Alasan pembalikan:")
    expect(r.container.textContent).not.toContain("Dibalik pada:")
    unmountCard(r.root)
  })
})

describe("HideWhenReversed + ReversedOrForm FIN-BR-008 (dedup pintu reversed)", () => {
  it("HideWhenReversed: reversed null, selain itu anak tampil", () => {
    const r = renderCard(
      <HideWhenReversed status="reversed">
        <span>aksi-ubah</span>
      </HideWhenReversed>,
    )
    expect(r.container.textContent ?? "").not.toContain("aksi-ubah")
    unmountCard(r.root)
    const v = renderCard(
      <HideWhenReversed status="completed">
        <span>aksi-ubah</span>
      </HideWhenReversed>,
    )
    expect(v.container.textContent ?? "").toContain("aksi-ubah")
    unmountCard(v.root)
  })

  it("ReversedOrForm: reversed tampil penanda tanpa form, draft tampil form tanpa penanda", () => {
    const r = renderCard(
      <ReversedOrForm status="reversed" reversalReason="Salah nominal" reversedAt="2026-10-28T03:00:00.000Z">
        <span>form-ubah</span>
      </ReversedOrForm>,
    )
    expect(r.container.textContent ?? "").toContain("sudah dibalik")
    expect(r.container.textContent ?? "").not.toContain("form-ubah")
    unmountCard(r.root)
    const v = renderCard(
      <ReversedOrForm status="draft">
        <span>form-ubah</span>
      </ReversedOrForm>,
    )
    expect(v.container.textContent ?? "").toContain("form-ubah")
    expect(v.container.textContent ?? "").not.toContain("sudah dibalik")
    unmountCard(v.root)
  })
})
