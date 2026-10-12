import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { addObject, buttonByText, clearCanvas, openApp, setMenu, storageJson, tr } from "../helpers";

test.skip(!process.env.UPDATE_FIXTURES, "set UPDATE_FIXTURES=1 to regenerate the Svelte-made fixture");

test("generate mixed-label.json", async ({ page }) => {
  await openApp(page);
  await clearCanvas(page);
  for (const key of ["text", "rectangle", "circle", "qrcode", "barcode", "aruco"]) {
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
