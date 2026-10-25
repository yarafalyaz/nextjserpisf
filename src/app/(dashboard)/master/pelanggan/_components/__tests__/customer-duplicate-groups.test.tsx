// @vitest-environment jsdom
import { describe, it, expect } from "vitest"
import {
  CustomerDuplicateGroups,
  type CustomerDuplicateGroupView,
} from "../customer-duplicate-groups"
import { mountInto, unmount, withContainer } from "@/components/forms/__tests__/form-a11y-test-utils"

// AC-CD-F2 (F-2026-10-25-003-S): daftar kandidat bergrup dari server —
// grup/matchLabel/key verbatim, anggota >=2, tautan detail + ubah
// existing. Grup <2 tidak tampil.
const groups: CustomerDuplicateGroupView[] = [
  {
    matchKind: "npwp",
    matchLabel: "NPWP sama",
    key: "012345678901000",
    members: [
      {
        id: 7,
        slug: "budi-santoso",
        name: "Budi Santoso",
        code: "CUST-0007",
        phone: "0812000111",
        email: null,
        taxId: "01.234.567.8-901.000",
        matchKind: "npwp",
        matchLabel: "NPWP sama",
      },
      {
        id: 9,
        slug: "budi-s",
        name: "Budi S",
        code: "CUST-0009",
        phone: null,
        email: null,
        taxId: "012345678901000",
        matchKind: "npwp",
        matchLabel: "NPWP sama",
      },
    ],
  },
  {
    matchKind: "phone",
    matchLabel: "Nomor telepon sama",
    key: "62812000111",
    members: [
      {
        id: 11,
        slug: "tunggal",
        name: "Tunggal Saja",
        code: null,
        phone: "0812000111",
        email: null,
        taxId: null,
        matchKind: "phone",
        matchLabel: "Nomor telepon sama",
      },
    ],
  },
]

describe("CustomerDuplicateGroups — AC-CD-F2", () => {
  it("grup >=2 tampil verbatim dengan tautan detail/ubah; grup <2 hilang", () => {
    withContainer((container) => {
      const root = mountInto(container, <CustomerDuplicateGroups groups={groups} />)
      expect(container.textContent).toContain("Kandidat Pelanggan Ganda")
      expect(container.textContent).toContain("NPWP sama: 012345678901000 (2 pelanggan)")
      expect(container.textContent).toContain("Budi Santoso")
      expect(container.textContent).toContain("Budi S")
      expect(container.textContent).not.toContain("Tunggal Saja")
      const hrefs = Array.from(container.querySelectorAll("a")).map((a) =>
        a.getAttribute("href"),
      )
      expect(hrefs).toContain("/master/pelanggan/budi-santoso")
      expect(hrefs).toContain("/master/pelanggan/budi-santoso/ubah")
      expect(hrefs).toContain("/master/pelanggan/budi-s/ubah")
      unmount(root, container)
    })
  })

  it("tanpa grup layak -> tidak render apa pun", () => {
    withContainer((container) => {
      const root = mountInto(container, <CustomerDuplicateGroups groups={[]} />)
      expect(container.textContent).not.toContain("Kandidat Pelanggan Ganda")
      unmount(root, container)
    })
  })
})
