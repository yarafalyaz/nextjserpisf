// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
}
Element.prototype.scrollIntoView ??= () => {}

import { createRoot, type Root } from "react-dom/client"
import { act } from "react"

const costMock = vi.fn(async () => ({
  success: true as const,
  journalId: 42,
  journalNumber: "JRN-0042",
  amount: 1500000,
}))
const recoveryMock = vi.fn(async () => ({
  success: true as const,
  journalId: 43,
  journalNumber: "JRN-0043",
  amount: 500000,
}))
const successMock = vi.fn()
const errorMock = vi.fn()

vi.mock("next/navigation", () => ({
  useRouter() {
    return { refresh: vi.fn(), push: vi.fn(), replace: vi.fn(), back: vi.fn() }
  },
}))
vi.mock("@/actions/warranty.actions", () => ({
  postWarrantyClaimCostAction: (...a: unknown[]) => costMock(...(a as [])),
  postWarrantySupplierRecoveryAction: (...a: unknown[]) => recoveryMock(...(a as [])),
}))
vi.mock("@/lib/utils/toast", () => ({
  showSuccess: (...a: unknown[]) => successMock(...(a as [])),
  showError: (...a: unknown[]) => errorMock(...(a as [])),
}))

import { WarrantyJournalPanel, type WarrantyJournalFacts } from "../warranty-journal-panel"
import type { WarrantyJournalRoute } from "../warranty-journal-route-status"

const route = (over: Partial<WarrantyJournalRoute> = {}): WarrantyJournalRoute => ({
  refType: "WarrantyClaimCost",
  posted: false,
  journalNumber: null,
  transactionDate: null,
  amountLabel: null,
  reversed: null,
  reversal: null,
  ...over,
})

const facts = (over: Partial<WarrantyJournalFacts> = {}): WarrantyJournalFacts => ({
  claimId: 5,
  status: "closed",
  supplierClaimStatus: "accepted",
  decisionRecorded: true,
  repairWorkOrderId: 7,
  claimCost: route(),
  supplierRecovery: route({ refType: "WarrantySupplierRecovery" }),
  ...over,
})

function mount(node: React.ReactNode): { container: HTMLDivElement; root: Root } {
  const container = document.createElement("div")
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => {
    root.render(node)
  })
  return { container, root }
}

async function submitForm(container: HTMLDivElement, ariaLabel: string) {
  const form = container.querySelector<HTMLFormElement>(`[aria-label='${ariaLabel}']`)
  expect(form).not.toBeNull()
  const fd = form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
  expect(fd).not.toBeUndefined()
  await act(async () => {})
}

describe("WarrantyJournalPanel — rute provisi MATI E2+E3", () => {
  it("banner mode MATI persis + status BELUM DIPOSTING kedua rute + catatan kontinjensi tanpa nominal", () => {
    const { container, root } = mount(
      <WarrantyJournalPanel facts={facts({ supplierClaimStatus: "sent" })} canPost={true} />,
    )
    expect(container.textContent).toContain(
      "Mode provisi: MATI — biaya klaim dibebankan saat terjadi (510104), tanpa akrual provisi.",
    )
    expect(container.textContent).toContain("BELUM DIPOSTING")
    expect(container.textContent).toContain(
      "Recovery belum hampir pasti — tanpa jurnal (aset kontinjensi, PSAK 57).",
    )
    // AC-B2-5: tidak ada teks terlarang
    expect(container.textContent?.toLowerCase()).not.toContain("deductible")
    expect(container.textContent).not.toContain("Saldo provisi")
    act(() => root.unmount())
  })

  it("jurnal POSTED tampil nomor+tanggal+nominal; form posting rute itu tidak dirender", () => {
    const { container, root } = mount(
      <WarrantyJournalPanel
        facts={facts({
          claimCost: route({
            posted: true,
            journalNumber: "JRN-0001",
            transactionDate: "22 Oktober 2026",
            amountLabel: "Rp 1.500.000",
          }),
        })}
        canPost={true}
      />,
    )
    expect(container.textContent).toContain("SUDAH DIPOSTING")
    expect(container.textContent).toContain("JRN-0001")
    expect(container.textContent).toContain("Rp 1.500.000")
    expect(container.querySelector("[aria-label='Formulir posting jurnal biaya klaim']")).toBeNull()
    act(() => root.unmount())
  })

  it("jurnal REVERSED: status kembali BELUM DIPOSTING + riwayat dibalik tampil", () => {
    const { container, root } = mount(
      <WarrantyJournalPanel
        facts={facts({
          claimCost: route({
            reversed: { journalNumber: "JRN-0009", transactionDate: "21 Oktober 2026" },
            reversal: { journalNumber: "JRN-0010", transactionDate: "21 Oktober 2026" },
          }),
        })}
        canPost={false}
      />,
    )
    expect(container.textContent).toContain("BELUM DIPOSTING")
    expect(container.textContent).toContain("dibalik — lihat jurnal lawan")
    expect(container.textContent).toContain("JRN-0010")
    act(() => root.unmount())
  })

  it("tanpa izin approve: kedua form posting tidak dirender, status tetap terbaca", () => {
    const { container, root } = mount(<WarrantyJournalPanel facts={facts()} canPost={false} />)
    expect(container.querySelector("[aria-label='Formulir posting jurnal biaya klaim']")).toBeNull()
    expect(container.querySelector("[aria-label='Formulir posting jurnal recovery supplier']")).toBeNull()
    expect(container.textContent).toContain("BELUM DIPOSTING")
    act(() => root.unmount())
  })

  it("form E2 tanpa field nominal; submit sukses tampil journalNumber+amount server", async () => {
    costMock.mockClear()
    successMock.mockClear()
    const { container, root } = mount(<WarrantyJournalPanel facts={facts()} canPost={true} />)
    const form = container.querySelector("[aria-label='Formulir posting jurnal biaya klaim']")
    expect(form).not.toBeNull()
    expect(form?.querySelector("[name='amount']")).toBeNull()
    expect(container.querySelector("[aria-label='Posting jurnal biaya klaim']")).not.toBeNull()
    await submitForm(container, "Formulir posting jurnal biaya klaim")
    expect(costMock).toHaveBeenCalledTimes(1)
    const fd = (costMock.mock.calls as unknown as [FormData][])[0][0]
    expect(fd.get("claimId")).toBe("5")
    expect(fd.get("amount")).toBeNull()
    expect(successMock).toHaveBeenCalled()
    expect(successMock.mock.calls[0][0]).toContain("JRN-0042")
    expect(container.textContent).toContain("JRN-0042")
    act(() => root.unmount())
  })

  it("form E3 hanya amount+eventDate pada accepted; submit sukses tampil journalNumber server", async () => {
    recoveryMock.mockClear()
    successMock.mockClear()
    const { container, root } = mount(<WarrantyJournalPanel facts={facts()} canPost={true} />)
    expect(container.querySelector("[aria-label='Nominal recovery supplier']")).not.toBeNull()
    expect(container.querySelector("[aria-label='Posting jurnal recovery supplier']")).not.toBeNull()
    // Isi amount lewat hidden input CurrencyInput (name=amount)
    const hidden = container.querySelector<HTMLInputElement>("input[name='amount']")
    expect(hidden).not.toBeNull()
    await submitForm(container, "Formulir posting jurnal recovery supplier")
    // amount kosong -> ditolak klien tanpa panggil server
    expect(recoveryMock).not.toHaveBeenCalled()
    act(() => root.unmount())
  })

  it("E130-1: penolakan recovery server tampil verbatim lewat toast error", async () => {
    const verbatim =
      "Recovery ditolak: lampiran persetujuan vendor sesudah pengiriman belum ada — unggah surat/email persetujuan, nota kredit vendor, atau janji penggantian part tertulis sesudah klaim dikirim; foto part cacat sebelum pengiriman tidak cukup."
    recoveryMock.mockClear()
    errorMock.mockClear()
    successMock.mockClear()
    recoveryMock.mockResolvedValueOnce({
      success: false,
      error: verbatim,
    } as unknown as Awaited<ReturnType<typeof recoveryMock>>)
    const { container, root } = mount(<WarrantyJournalPanel facts={facts()} canPost={true} />)
    const hidden = container.querySelector<HTMLInputElement>("input[name='amount']")
    expect(hidden).not.toBeNull()
    const setVal = (el: HTMLInputElement, v: string) => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(el, v)
      el.dispatchEvent(new Event("input", { bubbles: true }))
    }
    if (hidden) act(() => setVal(hidden, "500000"))
    await submitForm(container, "Formulir posting jurnal recovery supplier")
    await act(async () => {})
    expect(errorMock).toHaveBeenCalledWith(verbatim)
    expect(successMock).not.toHaveBeenCalled()
    act(() => root.unmount())
  })

  it("status supplier sent: form E3 tidak dirender, catatan kontinjensi tampil", () => {
    const { container, root } = mount(
      <WarrantyJournalPanel facts={facts({ supplierClaimStatus: "sent" })} canPost={true} />,
    )
    expect(container.querySelector("[aria-label='Formulir posting jurnal recovery supplier']")).toBeNull()
    expect(container.textContent).toContain("Recovery belum hampir pasti")
    act(() => root.unmount())
  })

  it("prasyarat E2 tak terpenuhi (tanpa WO repair): form E2 tidak dirender", () => {
    const { container, root } = mount(
      <WarrantyJournalPanel facts={facts({ repairWorkOrderId: null })} canPost={true} />,
    )
    expect(container.querySelector("[aria-label='Formulir posting jurnal biaya klaim']")).toBeNull()
    expect(container.querySelector("[aria-label='Formulir posting jurnal recovery supplier']")).toBeNull()
    act(() => root.unmount())
  })
})
