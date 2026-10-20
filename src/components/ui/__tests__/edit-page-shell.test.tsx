import { describe, it, expect } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import { EditPageShell } from "../edit-page-shell"

describe("EditPageShell", () => {
  it("render breadcrumb + judul + children identik shell ubah master", () => {
    const html = renderToStaticMarkup(
      <EditPageShell
        breadcrumbs={[
          { label: "Dasbor", href: "/" },
          { label: "Data Master", href: "/master" },
          { label: "Bank", href: "/master/bank" },
          { label: "Ubah" },
        ]}
        title="Ubah Bank: BCA"
      >
        <form data-testid="f">isi</form>
      </EditPageShell>,
    )
    expect(html).toContain("flex flex-col gap-6")
    expect(html).toContain("Ubah Bank: BCA")
    expect(html).toContain('href="/master/bank"')
    expect(html).toContain("isi")
    expect(html).toContain("Ubah")
  })
})
