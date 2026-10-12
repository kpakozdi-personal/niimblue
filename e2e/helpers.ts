import { readFileSync } from "node:fs";
import { expect, type Locator, type Page } from "@playwright/test";

export const ENTRY = process.env.E2E_ENTRY ?? "/";

const en = JSON.parse(readFileSync(new URL("../src/locale/dicts/en.json", import.meta.url), "utf8")) as Record<
  string,
  string
>;

export const tr = (key: string): string => {
  const value = en[key];
  if (value === undefined) {
    throw new Error(`No English string for key "${key}"`);
  }
  return value;
};

export interface Dialogs {
  messages: string[];
  promptValue?: string;
}

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const byTitle = (page: Page, key: string): Locator => page.getByTitle(tr(key), { exact: true });

/** Icons are private-use glyphs in the button text, so match the label with non-word characters ignored. */
export const buttonByText = (page: Page, label: string): Locator =>
  page.getByRole("button").filter({ hasText: new RegExp(`^\\W*${escapeRe(label)}\\W*$`) });

export async function setMenu(page: Page, titleKey: string, open: boolean): Promise<void> {
  const toggle = byTitle(page, titleKey);
  const expanded = (await toggle.getAttribute("aria-expanded")) === "true";
  if (expanded !== open) {
    await toggle.click();
  }
}

/**
 * Seeds localStorage once per tab (reloads keep whatever the app wrote),
 * accepts every confirm/prompt, then waits for the editor to be interactive.
 */
export async function openApp(page: Page, storage: Record<string, string> = {}): Promise<Dialogs> {
  const dialogs: Dialogs = { messages: [] };

  page.on("dialog", (dialog) => {
    dialogs.messages.push(dialog.message());
    void dialog.accept(dialogs.promptValue);
  });

  await page.addInitScript(
    (seed) => {
      if (sessionStorage.getItem("e2e-seeded") !== null) {
        return;
      }
      sessionStorage.setItem("e2e-seeded", "1");
      for (const [key, value] of Object.entries(seed)) {
        localStorage.setItem(key, value);
      }
    },
    { locale: "en", ...storage },
  );

  await page.goto(ENTRY);
  await expect(byTitle(page, "editor.undo")).toBeVisible();
  await expect(page.locator("canvas.upper-canvas")).toBeVisible();
  return dialogs;
}

export interface CanvasObject {
  type: string;
  left: number;
  top: number;
  [key: string]: any;
}

/**
 * Reads the canvas without touching app code: "Make default" serialises the
 * current label into localStorage["default_template"].
 */
export async function canvasObjects(page: Page): Promise<CanvasObject[]> {
  await setMenu(page, "params.saved_labels.menu_title", true);
  await buttonByText(page, tr("params.saved_labels.make_default")).click();
  const raw = await page.evaluate(() => localStorage.getItem("default_template"));
  await setMenu(page, "params.saved_labels.menu_title", false);
  await expect(buttonByText(page, tr("params.saved_labels.make_default"))).toBeHidden();
  if (raw === null) {
    throw new Error("default_template was not written");
  }
  return JSON.parse(raw).canvas.objects as CanvasObject[];
}

export async function clearCanvas(page: Page): Promise<void> {
  await byTitle(page, "editor.clear").click();
  expect(await canvasObjects(page)).toHaveLength(0);
}

export async function addObject(page: Page, nameKey: string): Promise<void> {
  await setMenu(page, "editor.objectpicker.title", true);
  await buttonByText(page, tr(nameKey)).click();
  await setMenu(page, "editor.objectpicker.title", false);
}

export async function chooseOption(select: Locator, label: string): Promise<void> {
  await select.selectOption({ label });
}
