import { describe, it, expect } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import { GENDER_CHOICES, OptionGroup } from "../option-group"

/**
 * OptionGroup menggantikan pola RadioGroup telanjang yang mengambang tanpa
 * wadah di grid form ("Jenis Kelamin") — dua bulatan kecil yang terbaca seperti
 * teks nyasar, padahal kontrol di sekitarnya berupa kotak bergaris penuh.
 *
 * Yang dikunci di sini: semantik radiogroup/radio tetap ada (bukan sekadar
 * tombol), label benar-benar terhubung ke grup, dan pilihan aktif ditandai
 * `data-state="on"` — tanpa penanda itu segmen terpilih tidak terlihat.
 */
function renderGroup(props: Partial<React.ComponentProps<typeof OptionGroup>> = {}) {
  return renderToStaticMarkup(
    <OptionGroup
      id="gender"
      label="Jenis Kelamin"
      value=""
      onChange={() => {}}
      options={GENDER_CHOICES}
      {...props}
    />,
  )
}

describe("OptionGroup", () => {
  it("memakai semantik radiogroup + radio, bukan sekadar tombol", () => {
    const html = renderGroup()
    expect(html).toContain('role="radiogroup"')
    expect(html.match(/role="radio"/g)?.length).toBe(GENDER_CHOICES.length)
  })

  it("menghubungkan label ke grup lewat aria-labelledby", () => {
    const html = renderGroup()
    expect(html).toContain('id="gender-label"')
    expect(html).toContain('aria-labelledby="gender-label"')
  })

  it("merender setiap label opsi", () => {
    const html = renderGroup()
    for (const choice of GENDER_CHOICES) {
      expect(html).toContain(choice.label)
    }
  })

  it("menandai tepat satu pilihan aktif", () => {
    const html = renderGroup({ value: "female" })
    expect(html.match(/aria-checked="true"/g)?.length).toBe(1)
    expect(html.match(/data-state="on"/g)?.length).toBe(1)
  })

  it("tidak menandai apa pun saat belum ada pilihan", () => {
    const html = renderGroup()
    expect(html).not.toContain('aria-checked="true"')
    expect(html).not.toContain('data-state="on"')
  })
})
