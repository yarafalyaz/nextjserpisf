// @vitest-environment jsdom
import { describe, it, expect } from "vitest"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

import { LockedEditGuard } from "../locked-edit-guard"
import {
  newTestContainer,
  renderTestUi,
  unmountTestUi,
} from "./confirm-button-test-utils"

describe("LockedEditGuard preset (GL-BR-003 K1)", () => {
  it("preset: crumb baku + label dokumen + tautan kembali bawaan", () => {
    const { container, root } = newTestContainer()
    renderTestUi(
      container,
      root,
      <LockedEditGuard
        preset={{
          section: "Faktur",
          sectionHref: "/penjualan/faktur",
          documentKind: "Faktur",
          documentNo: "F-1",
          slug: "F-1",
          correctionHref: "/penjualan/retur/tambah/faktur/F-1",
          correctionLabel: "retur penjualan",
          backLabel: "Kembali ke detail faktur",
        }}
      />,
    )
    expect(container.textContent).toContain("Faktur F-1 terkunci")
    const back = container.querySelector('a[href="/penjualan/faktur/F-1"]')
    expect(back?.textContent).toBe("Kembali ke detail faktur")
    unmountTestUi(root, container)
  })

  it("preset documentNo null: label 'tanpa nomor', bukan 'null'", () => {
    const { container, root } = newTestContainer()
    renderTestUi(
      container,
      root,
      <LockedEditGuard
        preset={{
          section: "Faktur",
          sectionHref: "/penjualan/faktur",
          documentKind: "Faktur",
          documentNo: null,
          slug: 9,
        }}
      />,
    )
    expect(container.textContent).toContain("Faktur tanpa nomor")
    expect(container.textContent).not.toContain("null")
    unmountTestUi(root, container)
  })
})
