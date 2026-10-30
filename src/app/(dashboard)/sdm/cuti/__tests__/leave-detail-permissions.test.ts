import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

describe("detail cuti gerbang izin UI (edit_leave_requests/delete_leave_requests)", () => {
  it("Ubah digerbang edit_leave_requests, Hapus digerbang delete_leave_requests", () => {
    const page = readFileSync(
      resolve(process.cwd(), "src/app/(dashboard)/sdm/cuti/[slug]/page.tsx"),
      "utf8",
    )
    expect(page).toContain('hasPermission("edit_leave_requests")')
    expect(page).toContain('hasPermission("delete_leave_requests")')
    expect(page).toMatch(/\{canEdit && \(\s*<Button href=\{entityEditHref\("\/sdm\/cuti"/)
    expect(page).toMatch(
      /\{canDelete && <DeleteButton id=\{leave\.id\} action=\{deleteLeaveRequest\} \/>\}/,
    )
    // Data baca tetap dirender tanpa gerbang tulis.
    expect(page).toContain("<DetailCard>")
  })
})
