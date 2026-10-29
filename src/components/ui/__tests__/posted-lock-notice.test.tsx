// @vitest-environment jsdom
import { describe, it, expect } from "vitest"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

import { PostedLockNotice } from "../posted-lock-notice"
import {
  newTestContainer,
  renderTestUi,
  unmountTestUi,
} from "./confirm-button-test-utils"

describe("PostedLockNotice (GL-BR-003 K1/K2)", () => {
  it("tampil judul terkunci + alasan + tautan jalur koreksi", () => {
    const { container, root } = newTestContainer()
    renderTestUi(
      container,
      root,
      <PostedLockNotice
        documentLabel="Faktur F-1"
        correctionHref="/penjualan/retur/tambah/faktur/F-1"
        correctionLabel="retur penjualan"
      />,
    )
    const note = container.querySelector('[role="note"]')
    expect(note?.getAttribute("aria-label")).toBe("Faktur F-1 terkunci")
    expect(container.textContent).toContain("Faktur F-1 terkunci — sudah posted")
    expect(container.textContent).toContain("tidak bisa diubah atau dihapus")
    const link = container.querySelector('a[href="/penjualan/retur/tambah/faktur/F-1"]')
    expect(link?.textContent).toBe("retur penjualan")
    unmountTestUi(root, container)
  })

  it("tanpa href: label koreksi tampil sebagai teks (bukan tautan)", () => {
    const { container, root } = newTestContainer()
    renderTestUi(
      container,
      root,
      <PostedLockNotice
        documentLabel="Pembayaran P-1"
        correctionLabel="pembayaran pengganti baru"
      />,
    )
    expect(container.querySelector("a")).toBeNull()
    expect(container.textContent).toContain("pembayaran pengganti baru")
    unmountTestUi(root, container)
  })
})
