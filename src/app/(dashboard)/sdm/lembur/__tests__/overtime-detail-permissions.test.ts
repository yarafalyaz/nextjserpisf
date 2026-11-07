import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

describe("detail lembur gerbang izin UI (edit_overtime_requests/delete_overtime_requests)", () => {
  it("Ubah digerbang edit_overtime_requests, Hapus digerbang delete_overtime_requests", () => {
    const page = readFileSync(
      resolve(process.cwd(), "src/app/(dashboard)/sdm/lembur/[slug]/page.tsx"),
      "utf8",
    )
    expect(page).toContain('hasPermission("edit_overtime_requests")')
    expect(page).toContain('hasPermission("delete_overtime_requests")')
    // Putaran 226: gerbang status ditambahkan di samping gerbang izin —
    // updateOvertimeRequest hanya menerima `pending`, deleteOvertimeRequest
    // menolak `approved` (jam lembur sudah masuk penggajian).
    expect(page).toMatch(/\{canEdit && isPending && \(\s*<Button href=\{entityEditHref\("\/sdm\/lembur"/)
    expect(page).toMatch(/\{canDelete && !isApproved && <DeleteButton id=\{overtime\.id\} action=\{deleteOvertimeRequest\} \/>\}/)
    // Data baca tetap dirender tanpa gerbang tulis.
    expect(page).toContain("<DetailCard>")
  })
})
