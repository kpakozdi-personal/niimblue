import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { buttonByText, openApp, tr } from "./helpers";

const ru = JSON.parse(readFileSync(new URL("../src/locale/dicts/ru.json", import.meta.url), "utf8")) as Record<
  string,
  string
>;

test("switching the language translates the UI and survives a reload", async ({ page }) => {
  await openApp(page);
  await expect(buttonByText(page, tr("editor.preview"))).toBeVisible();

  await page.getByLabel("Language").selectOption("ru");

  await expect(buttonByText(page, ru["editor.preview"])).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("locale"))).toBe("ru");

  await page.reload();

  await expect(buttonByText(page, ru["editor.preview"])).toBeVisible();
});

// Review focus 5: every locale must render, including ones with untranslated keys.
test("every locale renders without page errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await openApp(page);
  const codes = await page
    .getByLabel("Language")
    .locator("option")
    .evaluateAll((opts) => opts.map((o) => (o as HTMLOptionElement).value));

  expect(codes.length).toBeGreaterThanOrEqual(20);
  for (const code of codes) {
    await page.getByLabel("Language").selectOption(code);
    await expect(page.getByLabel("Language")).toHaveValue(code);
    await expect(page.locator("canvas.upper-canvas")).toBeVisible();
  }

  expect(errors).toEqual([]);
});
