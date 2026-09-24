import { expect, type Locator, type Page } from "@playwright/test"

/**
 * Shared helper for the app's `Combobox`.
 *
 * Current markup (src/components/ui/combobox.tsx): a `role="combobox"` BUTTON
 * whose label is the placeholder when nothing is selected, opening a popup that
 * contains the searchable `<input placeholder=...>` plus `role="option"` items.
 * Older specs targeted `input[placeholder='Cari …']` directly, which matched
 * nothing and made every create/update flow time out.
 *
 * `identify` picks the trigger either by its accessible name (the bound Label,
 * e.g. /departemen/i) or by the placeholder text it shows while empty.
 */
export async function openCombobox(
  page: Page,
  identify: { name?: RegExp; placeholder?: string },
): Promise<Locator> {
  const trigger = identify.name
    ? page.getByRole("combobox", { name: identify.name }).first()
    : page.getByRole("combobox").filter({ hasText: identify.placeholder! }).first()
  const legacy = identify.placeholder
    ? page.locator(`input[placeholder='${identify.placeholder}']`).first()
    : page.locator("[cmdk-input], [cmdk-input-wrapper] input, [role='listbox'] input").first()

  // Wait (bounded) for one of the two markups to appear: the form may still be
  // streaming in when the caller gets here, and an instant count() would fall
  // through to the legacy branch and time out on a page that was simply late.
  const deadline = Date.now() + 15_000
  while (Date.now() < deadline) {
    if ((await trigger.count()) > 0 || (await legacy.count()) > 0) break
    await page.waitForTimeout(200)
  }

  if ((await trigger.count()) > 0) {
    await expect(trigger).toBeVisible({ timeout: 10_000 })
    await trigger.click()
    if ((await legacy.count()) > 0) return legacy
    return trigger
  }

  // Legacy markup: the placeholder lives on the input itself.
  await expect(legacy).toBeVisible({ timeout: 10_000 })
  await legacy.click()
  return legacy
}

/**
 * Open the combobox and select the first available option.
 * Returns false when the combobox has no options at all (missing master data),
 * so the caller can decide to skip instead of hanging.
 */
export async function selectFirstComboboxOption(
  page: Page,
  identify: { name?: RegExp; placeholder?: string },
): Promise<boolean> {
  await openCombobox(page, identify)

  const option = page.getByRole("option").first()
  const appeared = await option
    .waitFor({ state: "visible", timeout: 10_000 })
    .then(() => true)
    .catch(() => false)
  if (!appeared) return false

  await option.click()
  return true
}

/** Open the combobox, filter by text, then pick the first remaining option. */
export async function selectComboboxOptionBySearch(
  page: Page,
  identify: { name?: RegExp; placeholder?: string },
  query: string,
  optionPattern?: RegExp,
): Promise<boolean> {
  const input = await openCombobox(page, identify)
  await input.fill(query)

  const option = optionPattern
    ? page.getByRole("option", { name: optionPattern }).first()
    : page.getByRole("option").first()
  const appeared = await option
    .waitFor({ state: "visible", timeout: 10_000 })
    .then(() => true)
    .catch(() => false)
  if (!appeared) return false

  await option.click()
  return true
}
