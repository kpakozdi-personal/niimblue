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
