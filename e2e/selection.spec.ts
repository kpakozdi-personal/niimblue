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
