import { test, expect } from "@playwright/test";

test("setup requires measurements, converts weight units and preserves feet/inches after reload", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByText(/Enter a valid height/)).toBeVisible();
  await expect(page.getByText(/STEP 1 \/ 3/)).toBeVisible();
  await page
    .getByRole("textbox", { name: "Height (feet)", exact: true })
    .fill("6");
  await page
    .getByRole("textbox", { name: "Height (inches)", exact: true })
    .fill("2");
  await page
    .getByRole("textbox", {
      name: "Starting weight (kg, required)",
      exact: true,
    })
    .fill("80");
  await page.getByRole("button", { name: "lb", exact: true }).click();
  await expect(
    page.getByRole("textbox", {
      name: "Starting weight (lbs, required)",
      exact: true,
    }),
  ).toHaveValue("176.37");
  await expect(
    page.getByRole("textbox", { name: "Available equipment", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Skip remaining optional setup", exact: true })
    .click();
  await page.getByRole("tab", { name: "You", exact: true }).click();
  await page
    .getByRole("button", { name: "Edit profile & preferences", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Height (feet)", exact: true }),
  ).toHaveValue("6");
  await expect(
    page.getByRole("textbox", { name: "Height (inches)", exact: true }),
  ).toHaveValue("2");
  await expect(
    page.getByRole("textbox", { name: "Available equipment", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "kg", exact: true }).click();
  await expect(
    page.getByRole("textbox", {
      name: "Starting weight (kg, required)",
      exact: true,
    }),
  ).toHaveValue("80");
  await page
    .getByRole("button", { name: "Save settings", exact: true })
    .click();
  await page.reload();
  await page
    .getByRole("button", { name: "Edit profile & preferences", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", {
      name: "Starting weight (kg, required)",
      exact: true,
    }),
  ).toHaveValue("80");
  await expect(
    page.getByRole("textbox", { name: "Height (feet)", exact: true }),
  ).toHaveValue("6");
});
