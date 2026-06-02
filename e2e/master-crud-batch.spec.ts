import { test, expect, type Page } from "@playwright/test"
import { skipOnMobile } from "./utils/desktop-only"

const ts = Date.now()

test.beforeEach(async ({}, testInfo) => {
  skipOnMobile(testInfo.project.name, "Batch CRUD ini khusus desktop; mobile sidebar overlay menghalangi interaksi form")
})

// ═══════════════════════════════════════════════════════════════════
// CRUD helper: reusable for simple master modules
// ═══════════════════════════════════════════════════════════════════
async function crudMaster(
  page: Page,
  opts: {
    listUrl: string
    createUrl: string
    fields: { id: string; value: string; updated?: string }[]
    submitId?: string
  }
) {
  // ─── CREATE ───────────────────────────────────────────────────
  await page.goto(opts.createUrl, { waitUntil: "domcontentloaded" })
  await waitForHydration(page)
  for (const f of opts.fields) {
    await page.locator(`#${f.id}, input[name='${f.id}'], textarea[name='${f.id}']`).first().fill(f.value)
  }
  const createSubmit = page.locator(
    [
      opts.submitId ? `#${opts.submitId}` : "",
      "button[type='submit']",
      "button:has-text('Simpan')",
      "button:has-text('Create')",
      "button:has-text('Tambah')",
    ].filter(Boolean).join(", ")
  ).first()
  await createSubmit.click()
  await page.waitForURL(`**${opts.listUrl}`, { timeout: 15000 })
  await page.waitForLoadState("networkidle")
  await expect(page.locator("body")).toContainText(opts.fields[0].value)

  if (!(await page.locator("body").filter({ hasText: opts.fields[0].value }).isVisible().catch(() => false))) {
    await page.goto(`${opts.listUrl}?cari=${encodeURIComponent(opts.fields[0].value)}`, { waitUntil: "domcontentloaded" })
    await page.waitForLoadState("networkidle")
  }

  // ─── READ detail/edit via ActionDropdown ─────────────────────
  const rowCreate = page.locator("tr").filter({ hasText: opts.fields[0].value })
  await expect(rowCreate).toBeVisible()
  await rowCreate.locator("button[aria-label='Menu']").click()
  await page.locator("[role='menuitem']").filter({ hasText: "Edit" }).first().click()
  await page.waitForURL(new RegExp(`${opts.listUrl.replace('/', '\\/')}\\/\\d+\\/ubah`), { timeout: 15000 })
  const currentUrl = page.url()
  const idMatch = currentUrl.match(/\/(\d+)\/ubah/)
  if (!idMatch) throw new Error("Could not parse ID from edit URL")
  const id = idMatch[1]

  // ─── UPDATE ───────────────────────────────────────────────────
  await page.goto(`${opts.listUrl}/${id}/ubah`, { waitUntil: "domcontentloaded" })
  await waitForHydration(page)
  for (const f of opts.fields) {
    if (f.updated) {
      await page.locator(`#${f.id}, input[name='${f.id}'], textarea[name='${f.id}']`).first().fill(f.updated)
    }
  }
  const submitBtn = page.locator(
    [
      opts.submitId ? `#${opts.submitId}` : "",
      "button[type='submit']",
      "button:has-text('Update')",
      "button:has-text('Simpan')",
    ].filter(Boolean).join(", ")
  ).first()
  await submitBtn.click()
  await page.waitForURL(`**${opts.listUrl}`, { timeout: 15000 })
  await page.waitForLoadState("networkidle")
  if (opts.fields[0].updated) {
    const updatedText = opts.fields.find((f) => f.updated && f.id === "name")?.updated ?? opts.fields[0].updated
    const updatedVisible = await page.locator("body").filter({ hasText: updatedText }).isVisible().catch(() => false)
    if (!updatedVisible) {
      await page.goto(`${opts.listUrl}?cari=${encodeURIComponent(updatedText)}`, { waitUntil: "domcontentloaded" })
      await page.waitForLoadState("networkidle")
    }
    await expect(page.locator("body")).toContainText(updatedText)
  }

  // ─── DELETE ───────────────────────────────────────────────────
  const searchText = opts.fields.find((f) => f.updated && f.id === "name")?.updated || opts.fields[0].updated || opts.fields[0].value
  const rowAfterUpdate = page.locator("tr").filter({ hasText: searchText }).first()
  await expect(rowAfterUpdate).toBeVisible()
  await rowAfterUpdate.locator("button[aria-label='Menu']").click()
  await page.locator("[role='menuitem']").filter({ hasText: "Hapus" }).first().click()
  await expect(page.getByText("Hapus data ini?")).toBeVisible({ timeout: 5000 })
  await page.locator("button").filter({ hasText: "Hapus" }).last().click()
  await expect(page.locator("body")).not.toContainText(searchText, { timeout: 10000 })
  await page.goto(opts.listUrl, { waitUntil: "domcontentloaded" })
  await page.waitForLoadState("networkidle")
  await expect(page.locator("body")).not.toContainText(searchText)
}


async function waitForHydration(page: Page) {
  await page.waitForLoadState("networkidle")
  await page.waitForTimeout(5000)
}


test.describe("Master Bank CRUD", () => {
  test("create → update → delete", async ({ page }) => {
    await crudMaster(page, {
      listUrl: "/master/bank",
      createUrl: "/master/bank/tambah",
      fields: [
        { id: "name", value: `Bank E2E ${ts}`, updated: `Bank E2E Updated ${ts}` },
        { id: "code", value: `BE2E${String(ts).slice(-5)}` },
      ],
      submitId: "submit-bank",
    })
  })
})

test.describe("Master Syarat Pembayaran CRUD", () => {
  test("create → update → delete", async ({ page }) => {
    await crudMaster(page, {
      listUrl: "/master/syarat-pembayaran",
      createUrl: "/master/syarat-pembayaran/tambah",
      fields: [
        { id: "name", value: `Term E2E ${ts}`, updated: `Term E2E Updated ${ts}` },
        { id: "code", value: `TE2E${String(ts).slice(-5)}` },
        { id: "days", value: "7", updated: "14" },
      ],
      submitId: "submit-payment-term",
    })
  })
})

test.describe("Master Brand CRUD", () => {
  test("create → update → delete", async ({ page }) => {
    await crudMaster(page, {
      listUrl: "/master/merek",
      createUrl: "/master/merek/tambah",
      fields: [
        { id: "name", value: `Brand E2E ${ts}`, updated: `Brand E2E Updated ${ts}` },
      ],
      submitId: "submit-brand",
    })
  })
})

test.describe("Master Kategori Barang CRUD", () => {
  test("create → update → delete", async ({ page }) => {
    await crudMaster(page, {
      listUrl: "/master/kategori-barang",
      createUrl: "/master/kategori-barang/tambah",
      fields: [
        { id: "name", value: `Kategori E2E ${ts}`, updated: `Kategori E2E Updated ${ts}` },
      ],
      submitId: "submit-item-category",
    })
  })
})

test.describe("Master Departemen CRUD", () => {
  test("create → update → delete", async ({ page }) => {
    await crudMaster(page, {
      listUrl: "/master/departemen",
      createUrl: "/master/departemen/tambah",
      fields: [
        { id: "name", value: `Dept E2E ${ts}`, updated: `Dept E2E Updated ${ts}` },
      ],
      submitId: "submit-department",
    })
  })
})

test.describe("Master Jabatan CRUD", () => {
  test("create → update → delete", async ({ page }) => {
    await crudMaster(page, {
      listUrl: "/master/jabatan",
      createUrl: "/master/jabatan/tambah",
      fields: [
        { id: "name", value: `Jabatan E2E ${ts}`, updated: `Jabatan E2E Updated ${ts}` },
      ],
      submitId: "submit-position",
    })
  })
})

test.describe("Master Mata Uang CRUD", () => {
  test("create → update → delete", async ({ page }) => {
    await crudMaster(page, {
      listUrl: "/master/mata-uang",
      createUrl: "/master/mata-uang/tambah",
      fields: [
        { id: "code", value: `CUR${String(ts).slice(-5)}`, updated: `CU${String(ts).slice(-4)}` },
        { id: "name", value: `Currency E2E ${ts}`, updated: `Currency E2E Updated ${ts}` },
        { id: "rate", value: "1.25", updated: "2.50" },
      ],
      submitId: "submit-currency",
    })
  })
})

test.describe("Master Pajak CRUD", () => {
  test("create → update → delete", async ({ page }) => {
    await crudMaster(page, {
      listUrl: "/master/pajak",
      createUrl: "/master/pajak/tambah",
      fields: [
        { id: "name", value: `Pajak E2E ${ts}`, updated: `Pajak E2E Updated ${ts}` },
        { id: "rate", value: "11", updated: "12" },
      ],
      submitId: "submit-tax",
    })
  })
})

test.describe("Master Pelanggan CRUD", () => {
  test("create → update → delete", async ({ page }) => {
    await crudMaster(page, {
      listUrl: "/master/pelanggan",
      createUrl: "/master/pelanggan/tambah",
      fields: [
        { id: "name", value: `Customer E2E ${ts}`, updated: `Customer E2E Updated ${ts}` },
        { id: "phone", value: `0812${String(ts).slice(-8)}`, updated: `0813${String(ts).slice(-8)}` },
        { id: "email", value: `cust${String(ts).slice(-6)}@e2e.test`, updated: `custupd${String(ts).slice(-6)}@e2e.test` },
      ],
    })
  })
})

test.describe("Master Pemasok CRUD", () => {
  test("create → update → delete", async ({ page }) => {
    await crudMaster(page, {
      listUrl: "/master/pemasok",
      createUrl: "/master/pemasok/tambah",
      fields: [
        { id: "name", value: `Vendor E2E ${ts}`, updated: `Vendor E2E Updated ${ts}` },
        { id: "phone", value: `0822${String(ts).slice(-8)}`, updated: `0823${String(ts).slice(-8)}` },
        { id: "email", value: `vendor${String(ts).slice(-6)}@e2e.test`, updated: `vendorupd${String(ts).slice(-6)}@e2e.test` },
      ],
    })
  })
})

test.describe("Master Akun Mutation", () => {
  test("create → update", async ({ page }) => {
    const name = `Akun E2E ${ts}`
    const updated = `Akun E2E Updated ${ts}`

    await page.goto("/master/akun/tambah", { waitUntil: "domcontentloaded" })
    await page.locator("#name").fill(name)

    // select required type
    await page.locator("button").filter({ hasText: "Pilih Tipe" }).first().click()
    await page.locator("[role='option'], [role='menuitem']").filter({ hasText: "ASSET" }).first().click()

    await page.locator("#submit-account").click()
    await page.waitForURL("**/master/akun", { timeout: 15000 })
    await page.waitForLoadState("networkidle")
    await expect(page.locator("body")).toContainText(name)

    // More reliable: find the edit link in the row containing our name
    const row = page.locator(".font-mono").filter({ hasText: /ACC-/ }).last()
    await expect(row).toBeVisible()

    // Navigate directly to the edit URL by finding the record's code
    const nameCell = page.locator("td").filter({ hasText: name }).first()
    await expect(nameCell).toBeVisible()
    const nameRow = nameCell.locator("xpath=ancestor::tr")
    const editAnchor = nameRow.locator("a[href*='/ubah']").first()
    await editAnchor.click()
    await page.waitForURL(/\/master\/akun\/\d+\/ubah/, { timeout: 15000 })

    // On edit form: fill name + re-select type (required)
    await page.locator("#name").fill(updated)
    // Type select doesn't have defaultValue on edit, click to open and re-select
    const typeButton = page.locator("button").filter({ hasText: /ASSET|LIABILITY|EQUITY|REVENUE|EXPENSE|Pilih Tipe/ }).first()
    await typeButton.click()
    await page.locator("[role='option'], [role='menuitem']").filter({ hasText: "ASSET" }).first().click()

    // Submit and wait for navigation
    await page.locator("#submit-account").click()
    await page.waitForLoadState("networkidle")
    await page.waitForURL(/\/master\/akun/, { timeout: 20000 })
    await expect(page.locator("body")).toContainText(updated)

    const rowUpdated = page.locator("td").filter({ hasText: updated }).first()
    await expect(rowUpdated).toBeVisible()
  })
})

test.describe("Kendaraan Merek CRUD", () => {
  test("create → update → delete", async ({ page }) => {
    await crudMaster(page, {
      listUrl: "/kendaraan/merek",
      createUrl: "/kendaraan/merek/tambah",
      fields: [
        { id: "name", value: `Vehicle Brand E2E ${ts}`, updated: `Vehicle Brand E2E Updated ${ts}` },
      ],
    })
  })
})

test.describe("Aset Merek CRUD", () => {
  test("create → update → delete", async ({ page }) => {
    await crudMaster(page, {
      listUrl: "/aset/merek",
      createUrl: "/aset/merek/tambah",
      fields: [
        { id: "name", value: `Asset Brand E2E ${ts}`, updated: `Asset Brand E2E Updated ${ts}` },
      ],
    })
  })
})

test.describe("Aset Kategori CRUD", () => {
  test("create → update → delete", async ({ page }) => {
    await crudMaster(page, {
      listUrl: "/aset/kategori",
      createUrl: "/aset/kategori/tambah",
      fields: [
        { id: "name", value: `Asset Category E2E ${ts}`, updated: `Asset Category E2E Updated ${ts}` },
        { id: "code", value: `AC${String(ts).slice(-5)}` },
        { id: "depreciationRate", value: "10", updated: "11" },
        { id: "usefulLife", value: "5", updated: "6" },
      ],
    })
  })
})

test.describe("Keuangan Cost Center CRUD", () => {
  test("create → update → delete", async ({ page }) => {
    await crudMaster(page, {
      listUrl: "/keuangan/pusat-biaya",
      createUrl: "/keuangan/pusat-biaya/tambah",
      fields: [
        { id: "code", value: `CC${String(ts).slice(-5)}`, updated: `CU${String(ts).slice(-5)}` },
        { id: "name", value: `Cost Center E2E ${ts}`, updated: `Cost Center E2E Updated ${ts}` },
      ],
    })
  })
})
