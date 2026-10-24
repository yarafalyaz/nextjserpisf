// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest"
import { AssetFiscalStatus } from "../asset-fiscal-status"
import { mountInto, unmount, withContainer } from "@/components/forms/__tests__/form-a11y-test-utils"

vi.mock("next/navigation", async () => (await import("@/components/forms/__tests__/form-a11y-test-utils")).routerModule)

describe("AssetFiscalStatus — label backend apa adanya", () => {
  it("jenis tercantum tanpa kelompok: belum dihitung, tanpa label kelompok", () => {
    withContainer((container) => {
      const root = mountInto(container, <AssetFiscalStatus taxGroupCode={null} taxTypeListed taxDjpDetermination={false} />)
      expect(container.textContent).toContain("Fiskal belum dihitung")
      expect(container.textContent).toContain("Jenis tercantum di PMK 72/2023 tetapi kelompok fiskal belum diisi.")
      expect(container.textContent).not.toContain("Kelompok 3")
      unmount(root, container)
    })
  })

  it("jenis tidak tercantum tanpa kelompok: Kelompok 3 default statutoris terhitung", () => {
    withContainer((container) => {
      const root = mountInto(container, <AssetFiscalStatus taxGroupCode={null} taxTypeListed={false} taxDjpDetermination={false} />)
      expect(container.textContent).toContain("Fiskal terhitung")
      expect(container.textContent).toContain("Kelompok 3 (16 tahun) (default statutoris)")
      unmount(root, container)
    })
  })

  it("kelompok terisi + penetapan DJP: label penetapan DJP", () => {
    withContainer((container) => {
      const root = mountInto(container, <AssetFiscalStatus taxGroupCode="GROUP_1" taxTypeListed taxDjpDetermination />)
      expect(container.textContent).toContain("Kelompok 1 (4 tahun) (penetapan DJP)")
      unmount(root, container)
    })
  })

  it("belum dinyatakan (null): belum dihitung, alasan belum dinyatakan", () => {
    withContainer((container) => {
      const root = mountInto(container, <AssetFiscalStatus taxGroupCode={null} taxTypeListed={null} taxDjpDetermination={false} />)
      expect(container.textContent).toContain("Fiskal belum dihitung")
      expect(container.textContent).toContain("belum dinyatakan")
      unmount(root, container)
    })
  })

  it("metode fiskal F-109-V tampil apa adanya: saldo menurun / belum dipilih", () => {
    withContainer((container) => {
      const root = mountInto(container, <AssetFiscalStatus taxGroupCode="GROUP_2" taxTypeListed taxDjpDetermination={false} fiscalMethod="declining_balance" />)
      expect(container.textContent).toContain("Metode fiskal: Saldo Menurun")
      unmount(root, container)
    })
    withContainer((container) => {
      const root = mountInto(container, <AssetFiscalStatus taxGroupCode="GROUP_2" taxTypeListed taxDjpDetermination={false} fiscalMethod={null} />)
      expect(container.textContent).toContain("Metode fiskal: Metode fiskal belum dipilih")
      unmount(root, container)
    })
  })
})
