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

/** Click the card's corner: its centre is covered by the export/delete buttons. */
const selectSavedLabel = (page: Page, title: string) =>
  page.getByRole("button", { name: title }).click({ position: { x: 3, y: 3 } });

/** After Load/Import the app closes the menu itself once the canvas has been replaced. */
const loadSettled = (page: Page) => expect(buttonByText(page, tr("params.saved_labels.make_default"))).toBeHidden();

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
  await selectSavedLabel(page, "e2e-label");
  await buttonByText(page, tr("params.saved_labels.load.browser")).click();
  await loadSettled(page);
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
  await loadSettled(page);

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

  await expect(page.getByText(/Canvas load error/).first()).toBeVisible();
  expect(dialogs.messages).toHaveLength(confirms);
  expect(await canvasObjects(page)).toHaveLength(before);
});

// Data compatibility: a label made by the Svelte app must load in every future entry.
test("loads the Svelte-made fixture label including its CSV data", async ({ page }) => {
  await openApp(page, { [`saved_label_${fixture.timestamp}_0`]: JSON.stringify(fixture) });

  await setMenu(page, MENU, true);
  await selectSavedLabel(page, "fixture");
  await buttonByText(page, tr("params.saved_labels.load.browser")).click();
  await loadSettled(page);

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
