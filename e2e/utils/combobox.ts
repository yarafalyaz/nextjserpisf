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
  const popoverInput = page
    .locator(
      "[data-slot='popover-content'][data-state='open'] [data-slot='command-input'], [data-slot='popover-content'][data-state='open'] [cmdk-input], [data-slot='popover-content'][data-state='open'] input, [data-slot='popover-content']:visible input, [cmdk-input]:visible, [cmdk-input-wrapper] input:visible, [role='listbox'] input:visible",
    )
    .first()
  const legacy = identify.placeholder
    ? page.locator(`input[placeholder='${identify.placeholder}']`).first()
    : popoverInput

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
    await expect(trigger).toBeEnabled({ timeout: 10_000 })

    // Wait cleanly for the opened popover search <input> / listbox instead of
    // returning the trigger <button> when clicked before React hydration.
    const openDeadline = Date.now() + 15_000
    while (Date.now() < openDeadline) {
      const expanded = await trigger.getAttribute("aria-expanded").catch(() => null)
      if (expanded !== "true") {
        await trigger.click({ timeout: 5_000 }).catch(() => {})
      }
      const opened = await popoverInput
        .waitFor({ state: "visible", timeout: 1_000 })
        .then(() => true)
        .catch(() => false)
      if (opened) return popoverInput
      await page.waitForTimeout(150)
    }

    await expect(popoverInput).toBeVisible({ timeout: 5_000 })
    return popoverInput
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

  const option = page.getByRole("listbox").getByRole("option").first()
  const appeared = await option
    .waitFor({ state: "visible", timeout: 10_000 })
    .then(() => true)
    .catch(() => false)
  if (!appeared) return false

  // Klik cmdk bisa timeout karena re-render; Enter memilih opsi aktif.
  const trigger = page.getByRole("combobox", { expanded: true });
  await option.click({ timeout: 5_000 }).catch(async () => {
    await page.keyboard.press("Enter")
  })
  
  // Wait for the combobox to either lose focus or disappear,
  // or for aria-expanded to become false.
  try {
    await expect(trigger).toHaveAttribute("aria-expanded", "false", { timeout: 5_000 });
  } catch {
    // If it's still expanded, it might be the trigger element itself that changed,
    // or the state didn't update as expected. Check if it's still attached.
    if (await trigger.isVisible()) {
      await trigger.press("Escape");
    }
  }
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
    : page.getByRole("listbox").getByRole("option").first()
  const appeared = await option
    .waitFor({ state: "visible", timeout: 10_000 })
    .then(() => true)
    .catch(() => false)
  if (!appeared) return false

  const trigger = page.getByRole("combobox", { expanded: true });
  await option.click({ timeout: 5_000 }).catch(async () => {
    await page.keyboard.press("Enter")
  })

  // Wait for the combobox to either lose focus or disappear,
  // or for aria-expanded to become false.
  try {
    await expect(trigger).toHaveAttribute("aria-expanded", "false", { timeout: 5_000 });
  } catch {
    // If it's still expanded, it might be the trigger element itself that changed,
    // or the state didn't update as expected. Check if it's still attached.
    if (await trigger.isVisible()) {
      await trigger.press("Escape");
    }
  }
  return true
}
