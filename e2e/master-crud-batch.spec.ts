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

  // ─── READ detail link ─────────────────────────────────────────
  const link = page.locator(opts.linkSelector).filter({ hasText: opts.fields[0].value }).first()
  await expect(link).toBeVisible()
  const href = await link.getAttribute("href")
  if (!href) throw new Error("Detail link not found")
  const id = href.split("/").pop()

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
  const row = page.locator("tr").filter({ hasText: searchText })
  await expect(row).toBeVisible()
  await row.locator("button[aria-label='Menu']").click()
  await page.locator("[role='menuitem']").filter({ hasText: "Hapus" }).first().click()
  // Confirm dialog
  await page.locator("button").filter({ hasText: "Hapus" }).last().click()
  await page.waitForTimeout(1500)
  await page.goto(opts.listUrl, { waitUntil: "domcontentloaded" })
  await page.waitForLoadState("networkidle")
  await expect(page.locator("body")).not.toContainText(searchText)
}

// ═══════════════════════════════════════════════════════════════════
// TEST SUITES
// ═══════════════════════════════════════════════════════════════════

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
