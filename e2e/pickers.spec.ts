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
