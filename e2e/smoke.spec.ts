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
