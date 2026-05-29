import { test, expect } from "@playwright/test"

const ts = Date.now()

// ═══════════════════════════════════════════════════════════════════
// CRUD helper: reusable for simple master modules
// ═══════════════════════════════════════════════════════════════════
async function crudMaster(
  page: any,
  opts: {
    listUrl: string
    createUrl: string
    fields: { id: string; value: string; updated?: string }[]
    submitId: string
    linkSelector: string // CSS selector to find detail link in list
  }
) {
  // ─── CREATE ───────────────────────────────────────────────────
  await page.goto(opts.createUrl, { waitUntil: "domcontentloaded" })
  for (const f of opts.fields) {
    await page.locator(`#${f.id}`).fill(f.value)
  }
  await page.locator(`#${opts.submitId}`).click()
  await page.waitForURL(`**${opts.listUrl}`, { timeout: 15000 })
  await page.waitForLoadState("networkidle")
  await expect(page.locator("body")).toContainText(opts.fields[0].value)

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
  for (const f of opts.fields) {
    if (f.updated) {
      await page.locator(`#${f.id}, input[name='${f.id}']`).first().fill(f.updated)
    }
  }
  // Find submit button (may not have same ID on edit form)
  const submitBtn = page.locator(`#${opts.submitId}, button[type='submit']:has-text('Update')`).first()
  await submitBtn.click()
  await page.waitForURL(`**${opts.listUrl}`, { timeout: 15000 })
  await page.waitForLoadState("networkidle")
  if (opts.fields[0].updated) {
    await expect(page.locator("body")).toContainText(opts.fields[0].updated)
  }

  // ─── DELETE ───────────────────────────────────────────────────
  const searchText = opts.fields[0].updated || opts.fields[0].value
  const rowAfterUpdate = page.locator("tr").filter({ hasText: searchText })
  await expect(rowAfterUpdate).toBeVisible()
  await rowAfterUpdate.locator("button[aria-label='Menu']").click()
  await page.locator("[role='menuitem']").filter({ hasText: "Hapus" }).first().click()
  // Confirm dialog
  await page.locator("button").filter({ hasText: "Hapus" }).last().click()
  await page.waitForTimeout(1500)
  await page.goto(opts.listUrl, { waitUntil: "domcontentloaded" })
  await page.waitForLoadState("networkidle")
  await expect(page.locator("body")).not.toContainText(searchText)
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
      linkSelector: "a[href^='/master/bank/']",
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
      linkSelector: "a[href^='/master/syarat-pembayaran/']",
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
      linkSelector: "a[href^='/master/merek/']",
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
      linkSelector: "a[href^='/master/kategori-barang/']",
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
      linkSelector: "a[href^='/master/departemen/']",
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
      linkSelector: "a[href^='/master/jabatan/']",
    })
  })
})
