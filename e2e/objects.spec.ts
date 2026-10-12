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
