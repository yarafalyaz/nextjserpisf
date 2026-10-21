import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import path from "node:path"

// Uji baca-sumber: field "Inspeksi Serah Terima" di detail WO (slice F-50
// frontend, display-only). Mengamankan query handover, href prefill benar,
// label tampil, dan — krusial — tidak ada blokir baru di UI (gate banner
// frontend tidak ditambah di luar backend assertQcCleared yang menolak
// NCR terbuka/inspeksi akhir non-passed; handover sendiri bukan gate backend).
const src = readFileSync(
  path.join(process.cwd(), "src/app/(dashboard)/produksi/perintah-kerja/[slug]/page.tsx"),
  "utf8",
)

describe("detail WO: field Inspeksi Serah Terima F-50", () => {
  it("kueri inspeksi vehicle_handover terbaru per WO", () => {
    expect(src).toContain('inspectionType: "vehicle_handover"')
    expect(src).toContain("vehicleHandover")
    expect(src).toContain('label="Inspeksi Serah Terima"')
  })

  it("href prefill serah terima menunjuk type/reference yang benar", () => {
    expect(src).toContain(
      "/produksi/qc/inspeksi/tambah/perintah-kerja/${wo.slug ?? wo.id}/tipe/vehicle_handover",
    )
  })

  it("tidak menambahkan blokir UI baru untuk handover (display-only)", () => {
    // Tidak ada klaim blokir handover; teks pemblokir apa pun akan muncul di
    // WorkOrderActions, bukan halaman ini — halaman hanya menampilkan status.
    expect(src).not.toContain("handoverBlocked")
    expect(src).not.toContain("Serah terima diblokir")
    expect(src).not.toContain("vehicleHandoverBlocked")
  })
})
