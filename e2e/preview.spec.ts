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
