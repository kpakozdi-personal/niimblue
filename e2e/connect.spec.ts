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

});
