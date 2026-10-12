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
