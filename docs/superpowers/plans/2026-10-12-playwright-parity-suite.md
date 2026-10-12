# Playwright Parity Suite Implementation Plan (Phase 1 of the Svelte to React migration)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Playwright smoke suite that pins the current Svelte app's behavior, so the same tests can later run unchanged against the React entry.

**Architecture:** A black-box suite in `e2e/` drives the built app (`vite build` + `vite preview`) through the real UI. Canvas state is read without any app code change: the helper clicks "Make default" in the saved-labels menu and reads the `default_template` entry from `localStorage`. All selectors are `title`, label, text or role based and use the English dictionary (`src/locale/dicts/en.json`) as the single source of strings, so the Radix/shadcn port can satisfy them. The entry URL comes from `E2E_ENTRY` (default `/`), which is how phase 2 adds a `react` project.

**Tech Stack:** `@playwright/test` (chromium only), TypeScript, existing Vite build, GitHub Actions (`check.yml`).

**Spec:** `docs/superpowers/specs/2026-10-12-svelte-to-react-migration-design.md` (section 4 and the "Rollout" PR 1).

## Global Constraints

- No production code under `src/` changes in this plan. If a control cannot be reached without a change, stop and report it; do not edit `src/`.
- Selectors: `getByTitle`, `getByRole`, `getByText`, `getByLabel`, `getByPlaceholder`, or the icon-glyph helper. No CSS class, id or `data-*` selectors, except fabric's own `canvas.upper-canvas`.
- All UI strings come from `src/locale/dicts/en.json` through the `tr()` helper. Never hardcode an English UI string in a spec.
- Tests must be independent: each starts with fresh browser storage and seeds `localStorage.locale = "en"`.
- The suite runs in chromium only, against `vite preview` of the production build.
- Persisted data format is the contract: assertions on `localStorage` use the exact keys `default_template`, `saved_label_*`, `last_label_props`, `config`, `csv_params`, `locale`.
- Conventional commits (`test:`, `ci:`, `docs:`), SSH remotes, one commit per task.

## Review Focus

The spec's test list covers the happy paths. These inputs are implied but easy to miss; each has a test in the named task.

1. Typing in an input must not trigger canvas hotkeys: Backspace/Delete in the saved-labels title input must not delete the selected object (Task 3).
2. Corrupt or schema-invalid `localStorage` (`config`, `last_label_props`, a `saved_label_*` entry) must not stop the app from starting (Task 5).
3. Importing a JSON file that parses but has the wrong schema must leave the canvas untouched and must not show the "replace canvas" confirm (Task 5).
4. A label width of 0 must be clamped to the minimum size, not produce a zero-width canvas (Task 4).
5. Every one of the 20 locales in the language selector must render without a page error, including ones with missing keys (Task 6).

---

### Task 1: Scaffold Playwright, core helpers and the smoke test

**Files:**
- Modify: `package.json` (devDependency, `e2e` script)
- Modify: `.gitignore`
- Modify: `tsconfig.json` (include `e2e/**/*.ts`, `playwright.config.ts`)
- Modify: `.fallowrc.json` (entry list)
- Create: `playwright.config.ts`
- Create: `e2e/helpers.ts`
- Test: `e2e/smoke.spec.ts`

**Interfaces:**
- Produces (in `e2e/helpers.ts`, used by every later task):
  - `ENTRY: string`
  - `tr(key: string): string`: English string for a dictionary key; throws if missing.
  - `interface Dialogs { messages: string[]; promptValue?: string }`
  - `openApp(page: Page, storage?: Record<string, string>): Promise<Dialogs>`: seeds storage once per tab, installs a dialog handler that accepts every `confirm`/`prompt` (using `dialogs.promptValue` for prompts) and records messages, loads the app and waits until it is interactive.
  - `byTitle(page: Page, key: string): Locator`: exact `title` match of the English string for `key`.
  - `buttonByText(page: Page, label: string): Locator`: a visible button whose text is `label` once leading icon glyphs are ignored.
  - `setMenu(page: Page, titleKey: string, open: boolean): Promise<void>`: opens or closes a toolbar popover by its toggle button, based on `aria-expanded`.
  - `interface CanvasObject { type: string; left: number; top: number; [key: string]: any }`
  - `canvasObjects(page: Page): Promise<CanvasObject[]>`

- [ ] **Step 1: Install Playwright and the chromium browser**

```bash
npm install -D @playwright/test
npx playwright install chromium
```
Expected: `package.json` gains `@playwright/test` under `devDependencies`; chromium downloads.

- [ ] **Step 2: Add the script, ignore rules, tsconfig include and fallow entries**

In `package.json` `scripts`, add after `"lint"`:

```json
"e2e": "playwright test",
```

Append to `.gitignore`:

```
/playwright-report
/test-results
```

In `tsconfig.json`, extend `include`:

```json
"include": [
  "vite.config.ts",
  "playwright.config.ts",
  "e2e/**/*.ts",
  "src/**/*.js",
  "src/**/*.ts",
  "src/**/*.svelte"
]
```

In `.fallowrc.json`, change `entry`:

```json
"entry": ["src/index.ts", "playwright.config.ts", "e2e/**/*.spec.ts"],
```

- [ ] **Step 3: Write `playwright.config.ts`**

```ts
import { defineConfig } from "@playwright/test";

const PORT = 4173;
const preview = `npm run preview -- --port ${PORT} --strictPort`;

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.spec.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
  },
  // Phase 2 adds a `react` project that sets E2E_ENTRY=/react.html.
  projects: [{ name: "svelte", use: { browserName: "chromium" } }],
  webServer: {
    // CI builds in the check job before this runs; locally build first.
    command: process.env.CI ? preview : `npm run build && ${preview}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
  },
});
```

- [ ] **Step 4: Write `e2e/helpers.ts`**

```ts
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

  await page.addInitScript((seed) => {
    if (sessionStorage.getItem("e2e-seeded") !== null) {
      return;
    }
    sessionStorage.setItem("e2e-seeded", "1");
    for (const [key, value] of Object.entries(seed)) {
      localStorage.setItem(key, value);
    }
  }, { locale: "en", ...storage });

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
```

- [ ] **Step 5: Write the failing smoke test `e2e/smoke.spec.ts`**

```ts
import { expect, test } from "@playwright/test";
import { canvasObjects, openApp } from "./helpers";

/** Console noise the Svelte app already emits; anything else is a regression. */
const KNOWN_NOISE: RegExp[] = [];

test("loads without console errors or page errors", async ({ page }) => {
  const problems: string[] = [];
  page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error" && !KNOWN_NOISE.some((re) => re.test(m.text()))) {
      problems.push(`console: ${m.text()}`);
    }
  });

  await openApp(page);

  expect(problems).toEqual([]);
});

test("starts with one default text object", async ({ page }) => {
  await openApp(page);

  const objects = await canvasObjects(page);

  expect(objects.map((o) => o.type.toLowerCase())).toEqual(["textbox"]);
  expect(objects[0].text).toBe("Text");
});
```

- [ ] **Step 6: Run the tests**

Run: `npm run e2e`
Expected: both tests PASS (the first run builds the app, so it takes a minute). If the console test fails because of pre-existing noise (for example a font preload 404), add one regex per message to `KNOWN_NOISE` with a one-line comment naming the source, and re-run. If a helper selector fails, fix the helper, not the test.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json .gitignore tsconfig.json .fallowrc.json playwright.config.ts e2e
git commit -m "test: add Playwright scaffolding and smoke tests"
```

---

### Task 2: Add objects and edit their parameters

**Files:**
- Modify: `e2e/helpers.ts` (append `clearCanvas`, `addObject`, `chooseOption`)
- Test: `e2e/objects.spec.ts`

**Interfaces:**
- Consumes: `openApp`, `tr`, `byTitle`, `buttonByText`, `setMenu`, `canvasObjects` from Task 1.
- Produces:
  - `clearCanvas(page: Page): Promise<void>`: clicks "Clear canvas" (the confirm is auto-accepted by `openApp`).
  - `addObject(page: Page, nameKey: string): Promise<void>`: opens the object picker, clicks the entry for the dictionary key (for example `"editor.objectpicker.rectangle"`), closes the picker. The new object ends up selected.
  - `chooseOption(select: Locator, label: string): Promise<void>`: picks an option of a native `<select>`; the single place phase 2 changes for Radix `Select`.

- [ ] **Step 1: Append the helpers to `e2e/helpers.ts`**

```ts
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
```

- [ ] **Step 2: Write `e2e/objects.spec.ts`**

```ts
import { expect, test } from "@playwright/test";
import { addObject, byTitle, canvasObjects, chooseOption, clearCanvas, openApp, tr } from "./helpers";

const CASES = [
  { key: "editor.objectpicker.text", type: "textbox" },
  { key: "editor.objectpicker.line", type: "polyline" },
  { key: "editor.objectpicker.rectangle", type: "rect" },
  { key: "editor.objectpicker.circle", type: "circle" },
  { key: "editor.objectpicker.qrcode", type: "qrcode" },
  { key: "editor.objectpicker.aruco", type: "arucomarker" },
  { key: "editor.objectpicker.barcode", type: "barcode" },
];

for (const { key, type } of CASES) {
  test(`adds a ${type} and selects it`, async ({ page }) => {
    await openApp(page);
    await clearCanvas(page);

    await addObject(page, key);

    const objects = await canvasObjects(page);
    expect(objects.map((o) => o.type.toLowerCase())).toEqual([type]);
    await expect(page.getByText(tr("editor.selection_hint"))).toBeHidden();
  });
}

test("edits text through the popup and toggles bold", async ({ page }) => {
  const dialogs = await openApp(page);
  await clearCanvas(page);
  await addObject(page, "editor.objectpicker.text");

  dialogs.promptValue = "Hello e2e";
  await byTitle(page, "params.text.edit").click();
  await byTitle(page, "params.text.bold").click();

  const [text] = await canvasObjects(page);
  expect(text.text).toBe("Hello e2e");
  expect(text.fontWeight).toBe("bold");
});

test("changes the font family of a text object", async ({ page }) => {
  await openApp(page);
  await clearCanvas(page);
  await addObject(page, "editor.objectpicker.text");

  await page.getByRole("textbox").fill("Courier New");

  const [text] = await canvasObjects(page);
  expect(text.fontFamily).toBe("Courier New");
});

test("edits QR code content", async ({ page }) => {
  await openApp(page);
  await clearCanvas(page);
  await addObject(page, "editor.objectpicker.qrcode");

  await page.getByRole("textbox").fill("https://example.com");

  const [qr] = await canvasObjects(page);
  expect(qr.text).toBe("https://example.com");
});

test("edits barcode content, encoding and caption", async ({ page }) => {
  await openApp(page);
  await clearCanvas(page);
  await addObject(page, "editor.objectpicker.barcode");
  const [before] = await canvasObjects(page);

  await page.getByRole("textbox").fill("5901234123457");
  await byTitle(page, "params.barcode.enable_caption").click();
  await chooseOption(page.getByRole("combobox").filter({ hasText: "EAN13" }), "Code128 B");

  const [after] = await canvasObjects(page);
  expect(after.text).toBe("5901234123457");
  expect(after.encoding).toBe("CODE128B");
  expect(after.printText).toBe(!before.printText);
});
```

- [ ] **Step 3: Run the tests**

Run: `npm run e2e -- e2e/objects.spec.ts`
Expected: 11 tests PASS. If a `getByRole("textbox")` is ambiguous (strict mode violation), narrow it by a stable label or title from the failing component and note the reason in a one-line comment. Do not use CSS selectors.

- [ ] **Step 4: Commit**

```bash
git add e2e
git commit -m "test: cover adding objects and editing text, QR and barcode params"
```

---

### Task 3: Selection, keyboard shortcuts and undo/redo

**Files:**
- Test: `e2e/selection.spec.ts`

**Interfaces:**
- Consumes: `openApp`, `tr`, `byTitle`, `setMenu`, `buttonByText`, `canvasObjects`, `clearCanvas`, `addObject` from Tasks 1 and 2.
- Produces: nothing new.

Grid step: arrow keys move by 5 px (`GRID_SIZE`), Ctrl/Cmd+arrow by 1 px; positions are rounded first, so assertions allow 0.5 px.

- [ ] **Step 1: Write `e2e/selection.spec.ts`**

```ts
import { expect, test, type Page } from "@playwright/test";
import { addObject, buttonByText, byTitle, canvasObjects, clearCanvas, openApp, setMenu, tr } from "./helpers";

const near = (actual: number, expected: number) => expect(Math.abs(actual - expected)).toBeLessThanOrEqual(0.5);

async function withSelectedRect(page: Page) {
  await openApp(page);
  await clearCanvas(page);
  await addObject(page, "editor.objectpicker.rectangle");
}

test("arrow keys move the selection by the grid step, ctrl by one pixel", async ({ page }) => {
  await withSelectedRect(page);
  const [start] = await canvasObjects(page);

  await page.keyboard.press("ArrowRight");
  const [right] = await canvasObjects(page);
  near(right.left - start.left, 5);

  await page.keyboard.press("Control+ArrowDown");
  const [down] = await canvasObjects(page);
  near(down.top - right.top, 1);

  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("ArrowUp");
  const [back] = await canvasObjects(page);
  near(back.left - down.left, -5);
  near(back.top - down.top, -5);
});

test("Escape clears the selection and brings back the hint", async ({ page }) => {
  await withSelectedRect(page);
  await expect(page.getByText(tr("editor.selection_hint"))).toBeHidden();

  await page.keyboard.press("Escape");

  await expect(page.getByText(tr("editor.selection_hint"))).toBeVisible();
});

test("Delete removes the selected object", async ({ page }) => {
  await withSelectedRect(page);

  await page.keyboard.press("Delete");

  expect(await canvasObjects(page)).toHaveLength(0);
});

test("Ctrl+D and the clone button duplicate the selection with an offset", async ({ page }) => {
  await withSelectedRect(page);
  const [original] = await canvasObjects(page);

  await page.keyboard.press("Control+d");
  await expect.poll(async () => (await canvasObjects(page)).length).toBe(2);
  const clones = await canvasObjects(page);
  near(clones[1].left - original.left, 5);
  near(clones[1].top - original.top, 5);

  await byTitle(page, "editor.clone").click();
  await expect.poll(async () => (await canvasObjects(page)).length).toBe(3);
});

test("the delete button removes the selection", async ({ page }) => {
  await withSelectedRect(page);

  await byTitle(page, "editor.delete").click();

  expect(await canvasObjects(page)).toHaveLength(0);
});

test("undo and redo work from the keyboard and the toolbar", async ({ page }) => {
  await openApp(page);
  await addObject(page, "editor.objectpicker.rectangle");
  await expect.poll(async () => (await canvasObjects(page)).length).toBe(2);

  await page.keyboard.press("Control+z");
  await expect.poll(async () => (await canvasObjects(page)).length).toBe(1);

  await page.keyboard.press("Control+y");
  await expect.poll(async () => (await canvasObjects(page)).length).toBe(2);

  await page.keyboard.press("Control+z");
  await page.keyboard.press("Control+Shift+z");
  await expect.poll(async () => (await canvasObjects(page)).length).toBe(2);

  await byTitle(page, "editor.undo").click();
  await expect.poll(async () => (await canvasObjects(page)).length).toBe(1);
  await byTitle(page, "editor.redo").click();
  await expect.poll(async () => (await canvasObjects(page)).length).toBe(2);
});

test("the grid button toggles the persisted grid setting", async ({ page }) => {
  await openApp(page);

  await byTitle(page, "editor.grid").click();

  const config = await page.evaluate(() => JSON.parse(localStorage.getItem("config") ?? "{}"));
  expect(config.gridEnabled).toBe(true);
});

test("hotkeys still work while a toolbar popover is open", async ({ page }) => {
  await openApp(page);
  await setMenu(page, "editor.objectpicker.title", true);
  await buttonByText(page, tr("editor.objectpicker.rectangle")).click();
  await expect.poll(async () => (await canvasObjects(page)).length).toBe(2);
  await setMenu(page, "editor.objectpicker.title", true);

  await page.keyboard.press("Control+z");

  await expect.poll(async () => (await canvasObjects(page)).length).toBe(1);
});

// Review focus 1: typing in an input must never act on the canvas selection.
test("Backspace in a text input does not delete the selected object", async ({ page }) => {
  await withSelectedRect(page);
  await setMenu(page, "params.saved_labels.menu_title", true);
  const title = page.getByPlaceholder(tr("params.saved_labels.label_title.placeholder"));
  await title.fill("abc");

  await title.press("Backspace");
  await title.press("Delete");

  await expect(title).toHaveValue("ab");
  expect(await canvasObjects(page)).toHaveLength(1);
});
```

- [ ] **Step 2: Run the tests**

Run: `npm run e2e -- e2e/selection.spec.ts`
Expected: 9 tests PASS. If the undo count is off by one (for example `clearCanvas` leaves extra history), keep the assertion on the observable object counts and drop any dependence on history length; if an assertion about the clone offset fails, print the two `left` values first and fix the expectation to what the app does, not the reverse.

- [ ] **Step 3: Commit**

```bash
git add e2e/selection.spec.ts
git commit -m "test: cover selection, hotkeys, clone and undo/redo"
```

---

### Task 4: Label properties and presets

**Files:**
- Modify: `e2e/helpers.ts` (append `storageJson`)
- Test: `e2e/label-props.spec.ts`

**Interfaces:**
- Consumes: `openApp`, `tr`, `byTitle`, `buttonByText`, `setMenu`, `chooseOption` from Tasks 1 and 2.
- Produces:
  - `storageJson(page: Page, key: string): Promise<any>`: parsed `localStorage` value, `null` if absent.
  - `iconButton(page: Page, icon: MaterialIcon): Locator`: a visible button whose text contains that Material icon's glyph (for icon-only buttons that have no title).

Facts from the source: on load the menu shows the default 240x96 px label as 30x12 mm at 8 dots/mm. Applying converts mm to px, enforces a minimum of one millimetre per side, and trims the head-side dimension to a multiple of 8. The result is stored in `last_label_props`.

- [ ] **Step 1: Append the helpers to `e2e/helpers.ts`**

Add this import at the top of the file:

```ts
import { iconCodepoints, type MaterialIcon } from "../src/styles/mdi_icons";
```

and append:

```ts
export async function storageJson(page: Page, key: string): Promise<any> {
  const raw = await page.evaluate((k) => localStorage.getItem(k), key);
  return raw === null ? null : JSON.parse(raw);
}

export const iconButton = (page: Page, icon: MaterialIcon): Locator =>
  page.getByRole("button").filter({ hasText: String.fromCodePoint(iconCodepoints[icon]) });
```

- [ ] **Step 2: Write `e2e/label-props.spec.ts`**

```ts
import { expect, test, type Page } from "@playwright/test";
import { buttonByText, chooseOption, iconButton, openApp, setMenu, storageJson, tr } from "./helpers";

const applyLabelProps = async (page: Page) => {
  await buttonByText(page, tr("params.label.apply")).click();
  await expect(page.getByText(tr("params.label.current"))).toBeVisible();
};

const lastProps = (page: Page) => storageJson(page, "last_label_props");

test("shows the default label size converted to millimetres", async ({ page }) => {
  await openApp(page);
  await setMenu(page, "params.label.menu_title", true);

  await expect(page.getByRole("spinbutton").nth(0)).toHaveValue("30");
  await expect(page.getByRole("spinbutton").nth(1)).toHaveValue("12");
  await expect(page.getByText(/240x96/)).toBeVisible();
});

test("applies a custom size in millimetres", async ({ page }) => {
  await openApp(page);
  await setMenu(page, "params.label.menu_title", true);

  await page.getByRole("spinbutton").nth(0).fill("48");
  await page.getByRole("spinbutton").nth(1).fill("16");
  await applyLabelProps(page);

  const props = await lastProps(page);
  expect(props.size).toEqual({ width: 384, height: 128 });
  expect(props.printDirection).toBe("left");
});

test("the swap button flips size and print direction", async ({ page }) => {
  await openApp(page);
  await setMenu(page, "params.label.menu_title", true);

  await iconButton(page, "swap_horiz").click();
  await applyLabelProps(page);

  const props = await lastProps(page);
  expect(props.printDirection).toBe("top");
  expect(props.size).toEqual({ width: 96, height: 240 });
});

test("the 300 dpi head density scales the pixel size", async ({ page }) => {
  await openApp(page);
  await setMenu(page, "params.label.menu_title", true);

  await chooseOption(page.getByRole("combobox").filter({ hasText: "203dpi" }), "300dpi");
  await applyLabelProps(page);

  const props = await lastProps(page);
  expect(props.size.width).toBe(354);
  expect(props.size.height % 8).toBe(0);
});

test("picking a preset applies it immediately", async ({ page }) => {
  await openApp(page);
  await setMenu(page, "params.label.menu_title", true);

  await page.getByText("50x30mm", { exact: true }).click();

  const props = await lastProps(page);
  expect(props.printDirection).toBe("top");
  expect(props.size).toEqual({ width: 400, height: 240 });
});

test("a saved template appears in the preset list and survives reload", async ({ page }) => {
  await openApp(page);
  await setMenu(page, "params.label.menu_title", true);
  await page.getByRole("spinbutton").nth(0).fill("33");
  await page.getByRole("spinbutton").nth(1).fill("17");

  await buttonByText(page, tr("params.label.save_template")).click();

  await expect(page.getByText("33x17mm", { exact: true })).toBeVisible();
  expect(await storageJson(page, "label_presets")).toHaveLength(5);

  await page.reload();
  await setMenu(page, "params.label.menu_title", true);
  await expect(page.getByText("33x17mm", { exact: true })).toBeVisible();
});

// Review focus 4: a zero size must be clamped, not produce an empty canvas.
test("a zero width is clamped to the minimum size", async ({ page }) => {
  await openApp(page);
  await setMenu(page, "params.label.menu_title", true);

  await page.getByRole("spinbutton").nth(0).fill("0");
  await applyLabelProps(page);

  const props = await lastProps(page);
  expect(props.size.width).toBeGreaterThan(0);
  expect(props.size.height).toBeGreaterThan(0);
});

test("the applied size survives a reload", async ({ page }) => {
  await openApp(page);
  await setMenu(page, "params.label.menu_title", true);
  await page.getByRole("spinbutton").nth(0).fill("48");
  await applyLabelProps(page);

  await page.reload();
  await setMenu(page, "params.label.menu_title", true);

  await expect(page.getByText(/384x/)).toBeVisible();
});
```

- [ ] **Step 3: Run the tests**

Run: `npm run e2e -- e2e/label-props.spec.ts`
Expected: 8 tests PASS. If the zero-width test's expected clamp differs (for example the app stores 8), keep the `> 0` assertions; they are the contract.

- [ ] **Step 4: Commit**

```bash
git add e2e
git commit -m "test: cover label properties, presets and size clamping"
```

---

### Task 5: Saved labels, import/export, data compatibility and resilient startup

**Files:**
- Create: `e2e/fixtures/generate.spec.ts` (skipped unless `UPDATE_FIXTURES=1`)
- Create: `e2e/fixtures/mixed-label.json` (generated from the Svelte app in Step 2)
- Test: `e2e/saved-labels.spec.ts`

**Interfaces:**
- Consumes: Task 1 to 4 helpers.
- Produces:
  - Fixture `e2e/fixtures/mixed-label.json`: an `ExportedLabelTemplate` with a text, rect, circle, QR, barcode and ArUco object, a title `"fixture"`, and CSV data `name,qty\napple,1\npear,2`. It must be generated by the Svelte app and never regenerated by the React app: it is the data-compatibility baseline for phase 2.

- [ ] **Step 1: Write the fixture generator `e2e/fixtures/generate.spec.ts`**

```ts
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { addObject, buttonByText, clearCanvas, openApp, setMenu, storageJson, tr } from "../helpers";

test.skip(!process.env.UPDATE_FIXTURES, "set UPDATE_FIXTURES=1 to regenerate the Svelte-made fixture");

test("generate mixed-label.json", async ({ page }) => {
  await openApp(page);
  await clearCanvas(page);
  for (const key of [
    "text",
    "rectangle",
    "circle",
    "qrcode",
    "barcode",
    "aruco",
  ]) {
    await addObject(page, `editor.objectpicker.${key}`);
  }

  await setMenu(page, "params.csv.title", true);
  await page.getByRole("textbox").fill("name,qty\napple,1\npear,2");
  await setMenu(page, "params.csv.title", false);

  await setMenu(page, "params.saved_labels.menu_title", true);
  await page.getByPlaceholder(tr("params.saved_labels.label_title.placeholder")).fill("fixture");
  await buttonByText(page, tr("params.saved_labels.save.browser")).click();
  const key = await page.evaluate(() => Object.keys(localStorage).find((k) => k.startsWith("saved_label")));
  const label = await storageJson(page, key!);

  expect(label.csv.data).toContain("apple");
  await writeFile(fileURLToPath(new URL("./mixed-label.json", import.meta.url)), JSON.stringify(label, null, 2) + "\n");
});
```

- [ ] **Step 2: Generate the fixture from the Svelte app**

Run: `UPDATE_FIXTURES=1 npm run e2e -- e2e/fixtures/generate.spec.ts`
Expected: PASS and `e2e/fixtures/mixed-label.json` exists. Verify:

```bash
node -e 'const l=JSON.parse(require("fs").readFileSync("e2e/fixtures/mixed-label.json","utf8"));console.log(l.title,l.canvas.objects.map(o=>o.type.toLowerCase()).join(","),!!l.csv)'
```
Expected: `fixture textbox,rect,circle,qrcode,barcode,arucomarker true`. If the CSV textbox is not the only visible textbox, scope it by the CSV menu heading; keep the assertion.

- [ ] **Step 3: Write `e2e/saved-labels.spec.ts`**

```ts
import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import {
  addObject,
  buttonByText,
  byTitle,
  canvasObjects,
  clearCanvas,
  iconButton,
  openApp,
  setMenu,
  storageJson,
  tr,
} from "./helpers";

const MENU = "params.saved_labels.menu_title";
const savedKeys = (page: Page) =>
  page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("saved_label")));

const fixture = JSON.parse(await readFile(new URL("./fixtures/mixed-label.json", import.meta.url), "utf8"));
const fixtureTypes = fixture.canvas.objects.map((o: { type: string }) => o.type.toLowerCase());

test("saves a label to browser storage, loads it back and deletes it", async ({ page }) => {
  await openApp(page);
  await clearCanvas(page);
  await addObject(page, "editor.objectpicker.rectangle");

  await setMenu(page, MENU, true);
  await page.getByPlaceholder(tr("params.saved_labels.label_title.placeholder")).fill("e2e-label");
  await buttonByText(page, tr("params.saved_labels.save.browser")).click();

  const [key] = await savedKeys(page);
  const saved = await storageJson(page, key);
  expect(saved.title).toBe("e2e-label");
  expect(saved.canvas.objects.map((o: { type: string }) => o.type.toLowerCase())).toEqual(["rect"]);
  await expect(page.getByText("e2e-label", { exact: true })).toBeVisible();
  await expect(page.getByAltText("thumbnail")).toBeVisible();

  await clearCanvas(page);
  await setMenu(page, MENU, true);
  await page.getByText("e2e-label", { exact: true }).click();
  await buttonByText(page, tr("params.saved_labels.load.browser")).click();
  await expect.poll(async () => (await canvasObjects(page)).length).toBe(1);

  await setMenu(page, MENU, true);
  await iconButton(page, "delete").click();
  await iconButton(page, "delete").click();
  await expect.poll(() => savedKeys(page)).toHaveLength(0);
});

test("Make default stores a template that loads on the next start", async ({ page }) => {
  await openApp(page);
  await clearCanvas(page);
  await addObject(page, "editor.objectpicker.circle");
  await canvasObjects(page); // Make default runs inside this helper

  await page.reload();

  await expect.poll(async () => (await canvasObjects(page)).map((o) => o.type.toLowerCase())).toEqual(["circle"]);
});

test("exports label JSON and imports it back", async ({ page }) => {
  await openApp(page);
  await clearCanvas(page);
  await addObject(page, "editor.objectpicker.rectangle");

  await setMenu(page, MENU, true);
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    buttonByText(page, tr("params.saved_labels.save.json")).click(),
  ]);
  const exported = JSON.parse(await readFile((await download.path())!, "utf8"));
  expect(exported.canvas.objects).toHaveLength(1);
  expect(exported.label.size.width).toBeGreaterThan(0);

  await clearCanvas(page);
  await setMenu(page, MENU, true);
  const chooser = page.waitForEvent("filechooser");
  await buttonByText(page, tr("params.saved_labels.load.json")).click();
  await (
    await chooser
  ).setFiles({ name: "label.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(exported)) });

  await expect.poll(async () => (await canvasObjects(page)).length).toBe(1);
});

// Review focus 3: wrong-schema JSON must not reach the "replace canvas" confirm.
test("importing JSON with the wrong schema leaves the canvas untouched", async ({ page }) => {
  const dialogs = await openApp(page);
  const before = (await canvasObjects(page)).length;
  const confirms = dialogs.messages.length;

  await setMenu(page, MENU, true);
  const chooser = page.waitForEvent("filechooser");
  await buttonByText(page, tr("params.saved_labels.load.json")).click();
  await (await chooser).setFiles({ name: "bad.json", mimeType: "application/json", buffer: Buffer.from('{"foo":1}') });

  await expect(page.locator(".toastify")).toBeVisible();
  expect(dialogs.messages).toHaveLength(confirms);
  expect(await canvasObjects(page)).toHaveLength(before);
});

// Data compatibility: a label made by the Svelte app must load in every future entry.
test("loads the Svelte-made fixture label including its CSV data", async ({ page }) => {
  await openApp(page, { [`saved_label_${fixture.timestamp}_0`]: JSON.stringify(fixture) });

  await setMenu(page, MENU, true);
  await page.getByText("fixture", { exact: true }).click();
  await buttonByText(page, tr("params.saved_labels.load.browser")).click();

  await expect.poll(async () => (await canvasObjects(page)).map((o) => o.type.toLowerCase())).toEqual(fixtureTypes);

  await setMenu(page, "params.csv.title", true);
  await expect(page.getByText(tr("params.csv.rowsfound")).locator("strong")).toHaveText("2");
});

// Review focus 2: broken storage must not stop the app from starting.
test("starts with corrupt and schema-invalid storage", async ({ page }) => {
  await openApp(page, {
    config: "{",
    last_label_props: '{"size":"bad"}',
    default_template: '{"canvas":1}',
    saved_label_1_0: '{"canvas":1}',
    csv_params: "not json",
    label_presets: '[{"nope":true}]',
  });

  await expect(byTitle(page, "editor.undo")).toBeVisible();
  // the invalid default template is skipped, so the built-in default text is added
  expect((await canvasObjects(page)).map((o) => o.type.toLowerCase())).toEqual(["textbox"]);
});
```

- [ ] **Step 4: Run the tests**

Run: `npm run e2e -- e2e/saved-labels.spec.ts`
Expected: 6 tests PASS. If the delete test finds two `delete` buttons, an object is selected; deselect first with `Escape`. If the corrupt-storage test fails because the app really does crash, do not weaken it: record the failing key in the commit message and open an issue note in `docs/superpowers/notes/` (create the folder); that is a pre-existing bug the React port must either preserve knowingly or fix.

- [ ] **Step 5: Commit**

```bash
git add e2e
git commit -m "test: cover saved labels, import/export, fixture compatibility and corrupt storage"
```

---

### Task 6: CSV, language switching and pickers

**Files:**
- Test: `e2e/csv.spec.ts`
- Test: `e2e/language.spec.ts`
- Test: `e2e/pickers.spec.ts`

**Interfaces:**
- Consumes: `openApp`, `tr`, `byTitle`, `buttonByText`, `setMenu`, `canvasObjects`, `clearCanvas`, `addObject` from Tasks 1 to 3.
- Produces: nothing new.

- [ ] **Step 1: Write `e2e/csv.spec.ts`**

```ts
import { expect, test } from "@playwright/test";
import { canvasObjects, clearCanvas, openApp, setMenu, storageJson, tr } from "./helpers";

test("typing CSV data enables it, counts rows and lists variables", async ({ page }) => {
  await openApp(page);
  await setMenu(page, "params.csv.title", true);

  await page.getByRole("textbox").fill("name,qty\napple,1\npear,2\nplum,3");

  await expect(page.getByText(tr("params.csv.rowsfound")).locator("strong")).toHaveText("3");
  await expect(page.getByRole("button", { name: "{name}" })).toBeVisible();
  await expect(page.getByRole("button", { name: "{qty}" })).toBeVisible();
  await expect(page.getByRole("switch", { name: tr("params.csv.enabled") })).toBeChecked();
  expect((await storageJson(page, "csv_params")).data).toContain("plum");
});

test("clicking a variable inserts a text object with that placeholder", async ({ page }) => {
  await openApp(page);
  await clearCanvas(page);
  await setMenu(page, "params.csv.title", true);
  await page.getByRole("textbox").fill("name,qty\napple,1");

  await page.getByRole("button", { name: "{name}" }).click();

  const objects = await canvasObjects(page);
  expect(objects).toHaveLength(1);
  expect(objects[0].text).toBe("{name}");
});
```

- [ ] **Step 2: Write `e2e/language.spec.ts`**

```ts
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
  const codes = await page.getByLabel("Language").locator("option").evaluateAll((opts) =>
    opts.map((o) => (o as HTMLOptionElement).value),
  );

  expect(codes.length).toBeGreaterThanOrEqual(20);
  for (const code of codes) {
    await page.getByLabel("Language").selectOption(code);
    await expect(page.getByLabel("Language")).toHaveValue(code);
    await expect(page.locator("canvas.upper-canvas")).toBeVisible();
  }

  expect(errors).toEqual([]);
});
```

- [ ] **Step 3: Write `e2e/pickers.spec.ts`**

```ts
import { expect, test } from "@playwright/test";
import { iconCodepoints } from "../src/styles/mdi_icons";
import { canvasObjects, clearCanvas, openApp, setMenu, tr } from "./helpers";

test("the icon picker searches and adds an icon as a Material Icons text object", async ({ page }) => {
  await openApp(page);
  await clearCanvas(page);
  await setMenu(page, "editor.iconpicker.title", true);

  await page.getByPlaceholder(tr("editor.iconpicker.search")).fill("home");
  await page.getByTitle("home", { exact: true }).click();

  const [icon] = await canvasObjects(page);
  expect(icon.fontFamily).toBe("Material Icons");
  expect(icon.text).toBe(String.fromCodePoint(iconCodepoints.home));
});
```

(The font-family text input is covered in Task 2; importing a font file is on the manual checklist in Task 8 because it needs a binary font fixture.)

- [ ] **Step 4: Run the tests**

Run: `npm run e2e -- e2e/csv.spec.ts e2e/language.spec.ts e2e/pickers.spec.ts`
Expected: 5 tests PASS. If the icon text object is selected and its toolbar adds a second textbox, `canvasObjects` is unaffected; only fix selectors in the failing line.

- [ ] **Step 5: Commit**

```bash
git add e2e
git commit -m "test: cover CSV, language switching and the icon picker"
```

---

### Task 7: Print preview and canvas pixel helpers

**Files:**
- Modify: `e2e/helpers.ts` (append `canvasHasInk`, `canvasDigest`)
- Test: `e2e/preview.spec.ts`

**Interfaces:**
- Consumes: Task 1 to 4 helpers, including `iconButton`.
- Produces:
  - `canvasHasInk(canvas: Locator): Promise<boolean>`: true if the canvas contains more than one distinct pixel value.
  - `canvasDigest(canvas: Locator): Promise<string>`: SHA-256 hex of `toDataURL()`. Phase 2/3 uses it for the cross-entry raster identity test (open `/` and `/react.html` in one test and compare digests).

- [ ] **Step 1: Append the pixel helpers to `e2e/helpers.ts`**

```ts
export const canvasHasInk = (canvas: Locator): Promise<boolean> =>
  canvas.evaluate((el: HTMLCanvasElement) => {
    const ctx = el.getContext("2d");
    if (!ctx || el.width === 0 || el.height === 0) {
      return false;
    }
    const d = ctx.getImageData(0, 0, el.width, el.height).data;
    for (let i = 4; i < d.length; i += 4) {
      if (d[i] !== d[0] || d[i + 1] !== d[1] || d[i + 2] !== d[2] || d[i + 3] !== d[3]) {
        return true;
      }
    }
    return false;
  });

export const canvasDigest = (canvas: Locator): Promise<string> =>
  canvas.evaluate(async (el: HTMLCanvasElement) => {
    const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(el.toDataURL()));
    return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, "0")).join("");
  });
```

- [ ] **Step 2: Write `e2e/preview.spec.ts`**

```ts
import { expect, test, type Page } from "@playwright/test";
import { buttonByText, canvasDigest, canvasHasInk, iconButton, openApp, tr } from "./helpers";

const previewCanvas = (page: Page) => page.getByRole("dialog").locator("canvas").first();

async function openPreview(page: Page) {
  await buttonByText(page, tr("editor.preview")).click();
  await expect(page.getByRole("heading", { name: tr("preview.title") })).toBeVisible();
  await expect.poll(() => canvasHasInk(previewCanvas(page))).toBe(true);
}

test("opens a preview of the label, and closes it", async ({ page }) => {
  await openApp(page);

  await openPreview(page);
  const box = await previewCanvas(page).boundingBox();
  expect(box!.width).toBeGreaterThan(0);

  await buttonByText(page, tr("preview.close")).click();
  await expect(page.getByRole("heading", { name: tr("preview.title") })).toBeHidden();
});

test("the preview raster is deterministic across openings", async ({ page }) => {
  await openApp(page);

  await openPreview(page);
  const first = await canvasDigest(previewCanvas(page));
  await buttonByText(page, tr("preview.close")).click();
  await expect(page.getByRole("heading", { name: tr("preview.title") })).toBeHidden();
  await openPreview(page);

  expect(await canvasDigest(previewCanvas(page))).toBe(first);
});

test("invert flips the raster and flipping back restores it", async ({ page }) => {
  await openApp(page);
  await openPreview(page);
  const original = await canvasDigest(previewCanvas(page));

  await iconButton(page, "invert_colors").click();
  await expect.poll(() => canvasDigest(previewCanvas(page))).not.toBe(original);

  await iconButton(page, "invert_colors").click();
  await expect.poll(() => canvasDigest(previewCanvas(page))).toBe(original);
});

test("changing the post-process algorithm keeps the preview rendered", async ({ page }) => {
  await openApp(page);
  await openPreview(page);

  await page
    .getByRole("combobox")
    .filter({ hasText: tr("preview.postprocess.threshold") })
    .selectOption({ label: tr("preview.postprocess.atkinson") });

  await expect.poll(() => canvasHasInk(previewCanvas(page))).toBe(true);
});

test("print is disabled while no printer is connected", async ({ page }) => {
  await openApp(page);

  await expect(buttonByText(page, tr("editor.print"))).toBeDisabled();
});
```

- [ ] **Step 3: Run the whole suite**

Run: `npm run e2e`
Expected: all tests PASS (about 50). If "invert" does not change the digest, the icon button matched the wrong element; print `await iconButton(page, "invert_colors").count()` and narrow within the dialog.

- [ ] **Step 4: Commit**

```bash
git add e2e
git commit -m "test: cover print preview and add canvas pixel helpers"
```

---

### Task 8: Printer I/O spike (fake Web Serial port) and the hardware checklist

**Files:**
- Create: `e2e/fake-serial.ts`
- Test: `e2e/connect.spec.ts` (only if the spike succeeds)
- Create: `docs/superpowers/notes/2026-10-12-printer-io-and-hardware-checklist.md`

**Interfaces:**
- Consumes: `openApp`, `tr`, `buttonByText`, `byTitle` from Task 1.
- Produces (only on success): `installFakeSerial(page: Page): Promise<void>`, to be called before `openApp`.

This task is time-boxed to one hour of effort. Its deliverable is a decision, written down, plus the manual checklist, in either outcome.

Background (verified in `@mmote/niimbluelib`): the serial client calls `navigator.serial.requestPort()`, `port.open({ baudRate: 115200 })`, reads `port.readable` and writes `port.writable`, then runs a negotiation of request packets. Frames are `55 55 <cmd> <len> <data...> <checksum> aa aa` where `checksum` is the XOR of `cmd`, `len` and all data bytes. The library's own docs show a working connect exchange: request `40 01 08` is answered by `48 02 09 00`, `40 01 0c` by `4c 02 05 1e`, `40 01 09` by `49 02 05 1e`, and `c1 01 01` by `c2 01 02`.

- [ ] **Step 1: Write the logging fake port `e2e/fake-serial.ts`**

```ts
import type { Page } from "@playwright/test";

/** Replaces navigator.serial with a port that logs every request frame to window.__serialLog and replies from a table. */
export async function installFakeSerial(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const log: string[] = [];
    (window as unknown as { __serialLog: string[] }).__serialLog = log;

    const frame = (cmd: number, data: number[]): Uint8Array => {
      const checksum = [cmd, data.length, ...data].reduce((a, b) => a ^ b, 0);
      return Uint8Array.from([0x55, 0x55, cmd, data.length, ...data, checksum, 0xaa, 0xaa]);
    };

    // request command -> [response command, response data]; extend from __serialLog during the spike
    const RESPONSES: Record<number, (data: number[]) => [number, number[]] | undefined> = {
      0xc1: () => [0xc2, [0x02]],
      0x40: (data) => {
        const infoType = data[0];
        if (infoType === 0x08) return [0x48, [0x09, 0x00]];
        if (infoType === 0x0c) return [0x4c, [0x05, 0x1e]];
        if (infoType === 0x09) return [0x49, [0x05, 0x1e]];
        return undefined;
      },
    };

    let controller!: ReadableStreamDefaultController<Uint8Array>;
    const readable = new ReadableStream<Uint8Array>({ start: (c) => (controller = c) });
    const writable = new WritableStream<Uint8Array>({
      write(chunk) {
        // request frame: 55 55 cmd len data... chk aa aa
        const cmd = chunk[2];
        const len = chunk[3];
        const data = Array.from(chunk.slice(4, 4 + len));
        log.push(`${cmd.toString(16)} ${data.map((b) => b.toString(16)).join(" ")}`);
        const reply = RESPONSES[cmd]?.(data);
        if (reply) {
          controller.enqueue(frame(reply[0], reply[1]));
        }
      },
    });

    const port = Object.assign(new EventTarget(), {
      readable,
      writable,
      open: async () => {},
      close: async () => {},
      getInfo: () => ({ usbVendorId: 0x3513, usbProductId: 0x0002 }),
    });

    Object.defineProperty(navigator, "serial", {
      configurable: true,
      value: { requestPort: async () => port },
    });
  });
}
```

- [ ] **Step 2: Write the exploratory connect test `e2e/connect.spec.ts`**

```ts
import { expect, test } from "@playwright/test";
import { installFakeSerial } from "./fake-serial";
import { buttonByText, byTitle, openApp, tr } from "./helpers";

test("connects to a fake serial printer", async ({ page }) => {
  await installFakeSerial(page);
  await openApp(page, { connection_type: "serial" });

  await buttonByText(page, tr("connector.serial")).click();
  await byTitle(page, "connector.connect").click();

  await expect(byTitle(page, "connector.settings")).toBeVisible({ timeout: 15_000 });
  await expect(buttonByText(page, tr("editor.print"))).toBeEnabled();

  console.log(await page.evaluate(() => (window as unknown as { __serialLog: string[] }).__serialLog));
});
```

- [ ] **Step 3: Run it and read the request log**

Run: `npm run e2e -- e2e/connect.spec.ts`
Expected, one of:
- PASS: the connect handshake works with the table above. Go to Step 5.
- FAIL on the connect timeout: the printed `__serialLog` (re-run with `--reporter=list` and read the console output) shows which request commands arrived without a reply. Go to Step 4.

- [ ] **Step 4: Extend the response table, at most three rounds**

For each unanswered request in the log, add an entry to `RESPONSES` using the response command from the library enums (`grep -n "ResponseCommandId" -A60 node_modules/@mmote/niimbluelib/dist/cjs/packets/packet_class.d.ts` shows the ids) and the smallest data that makes the parsed field valid. Re-run. If the connect still fails after three rounds, stop: mark the test `test.fixme(...)` with a one-line reason, keep `fake-serial.ts` out of the commit (`git restore --staged`, `git checkout -- e2e/fake-serial.ts` if tracked), and record the last unanswered request ids in the notes file from Step 5.

- [ ] **Step 5: Remove the debug log and write the notes**

If connect passes, delete the `console.log(...)` line from `connect.spec.ts`. Create `docs/superpowers/notes/2026-10-12-printer-io-and-hardware-checklist.md`:

```markdown
# Printer I/O automation and hardware checklist

## Automation outcome

State here which happened: either "connect is automated with `e2e/fake-serial.ts`; printing is not" or
"connect is not automated; unanswered request ids after three rounds were: ...".

Printing (the print job packets and progress) is not automated in either case.

## Manual hardware checklist (must pass on the React entry before cutover)

Run on a real printer against both `/` (Svelte) and `/react.html` (React), compare results.

- [ ] USB (Web Serial): connect, device name and battery show in the header, disconnect.
- [ ] Bluetooth (Web Bluetooth): connect, disconnect, reconnect.
- [ ] Settings popover: HW/FW versions, RFID paper info refresh, power and connection sound switches.
- [ ] "Detailed information" dialog opens and shows data.
- [ ] Print preview: Print button enabled when connected; print one label; copies = 2 prints two.
- [ ] Print progress bar and "Cancel print" during a multi-copy job.
- [ ] Density, label type and print task selection change the output; the lock buttons persist them across reload.
- [ ] Offset (inner/outer) shifts the print as expected.
- [ ] Firmware updater dialog opens (do NOT flash).
- [ ] Heartbeat on/off from the debug section; unplug the printer, the UI shows the disconnected state.
- [ ] Font import: add a .ttf/.otf through the font menu, it appears in the font list, text renders with it, survives reload.
- [ ] ZPL import and PDF import add an image object.
- [ ] Image object: add via file picker, fit-to-page modes (stretch / fit / fill).
- [ ] Android (Capacitor) and Windows (Tauri) builds start and connect (cutover PR only).
```

- [ ] **Step 6: Run the whole suite, then commit**

Run: `npm run e2e`
Expected: PASS (and the connect test PASS, or skipped via `fixme`).

```bash
git add e2e docs/superpowers/notes
git commit -m "test: spike fake serial printer and add hardware checklist"
```

---

### Task 9: Run the suite in CI and document it

**Files:**
- Modify: `.github/workflows/check.yml`
- Modify: `CONTRIBUTING.md`

**Interfaces:**
- Consumes: the `e2e` npm script and `playwright.config.ts` (`CI` mode skips the build and serves `dist` with `vite preview`).
- Produces: a green `Check` workflow that includes the e2e suite, which `Deploy` reuses via `workflow_call`.

- [ ] **Step 1: Add the e2e steps to `check.yml`**

After the `actions/upload-artifact` step of the `dist` artifact, append:

```yaml
      - run: npx playwright install --with-deps chromium
      - run: npm run e2e

      - uses: actions/upload-artifact@v7
        if: failure()
        with:
          name: playwright-report
          path: |
            playwright-report
            test-results
          retention-days: 7
```

- [ ] **Step 2: Document the suite in `CONTRIBUTING.md`**

Add under the checks list (next to the `sv-check` / `lint` line):

```markdown
- Run `npm run e2e` before submitting a pull request. It builds the app and drives it with Playwright (chromium). First run: `npx playwright install chromium`. To regenerate the compatibility fixture from the Svelte app: `UPDATE_FIXTURES=1 npm run e2e -- e2e/fixtures/generate.spec.ts`.
```

- [ ] **Step 3: Run every gate locally**

Run:

```bash
npm run lint && npm run sv-check && npx fallow dead-code --fail-on-issues && npx fallow dupes --fail-on-issues && npm run build && CI=1 npm run e2e
```
Expected: all pass. Fix findings in the new files only: fallow may flag helpers that no spec imports (delete them) or the duplicated `canvasObjects(...).length` poll (acceptable at `minOccurrences: 3` only if it stays under three identical blocks; extract a `waitForObjectCount(page, n)` helper into `helpers.ts` and use it in `selection.spec.ts` and the others if it triggers).

- [ ] **Step 4: Commit and open the PR**

```bash
git add .github/workflows/check.yml CONTRIBUTING.md e2e
git commit -m "ci: run the Playwright parity suite in the check workflow"
git push -u fork HEAD
gh pr create -R kpakozdi-personal/niimblue --base main --title "test: add Playwright parity suite for the Svelte app" --body "Phase 1 of the Svelte to React migration (spec: docs/superpowers/specs/2026-10-12-svelte-to-react-migration-design.md). Adds the e2e suite, a Svelte-made data fixture and the hardware checklist. No changes under src/."
```
Expected: the `Check` workflow runs the suite and passes on the PR; the branch also gets a preview deploy because the push touches more than `.github/**` and markdown.

---

## Self-review notes

- **Spec coverage:** spec section 4 tests 1 to 10 map to Tasks 1 to 7; fixture compatibility is Task 5; raster identity is prepared in Task 7 (`canvasDigest`) and executed in phase 2 where both entries exist; printer I/O spike and manual checklist are Task 8; CI is Task 9. Deviations: font *import* and the font dropdown are manual (binary fixture / permission API), listed in the Task 8 checklist.
- **Type consistency:** helper names and signatures in "Interfaces" blocks match their use (`openApp` returns `Dialogs`, `setMenu(page, titleKey, open)`, `canvasObjects`, `chooseOption(select, label)`, `iconButton(page, icon)`, `storageJson(page, key)`).
- **Known unverified details (resolved by running the tests):** exact fabric `type` strings (compared lower-cased), whether `getByRole("textbox")` is unique in each selection state, the pre-existing console noise list, and the delete-button hover behavior. Each such step says what to adjust.
