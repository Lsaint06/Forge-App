import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

test("browser saves workouts across reloads and confirms backup replacement and deletion", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await page
    .getByRole("textbox", { name: "Height (feet)", exact: true })
    .fill("5");
  await page
    .getByRole("textbox", { name: "Height (inches)", exact: true })
    .fill("10");
  await page
    .getByRole("textbox", {
      name: "Starting weight (kg, required)",
      exact: true,
    })
    .fill("75");
  await page
    .getByRole("button", { name: "Skip remaining optional setup" })
    .click();
  await expect(page.getByText("Ready, Athlete?")).toBeVisible();
  expect(await page.evaluate(() => crossOriginIsolated)).toBe(true);
  await page.getByRole("tab", { name: "train", exact: true }).click();
  await page.getByRole("button", { name: "Start freestyle workout" }).click();
  await page.getByRole("button", { name: "Add exercise", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Search exercises" })
    .fill("Barbell Bench Press");
  await page
    .getByRole("button", { name: "Add Barbell Bench Press", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Load (kg)", exact: true })
    .fill("40");
  await page.getByRole("textbox", { name: "Reps", exact: true }).fill("8");
  await page.getByRole("button", { name: "Complete", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Done", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("textbox", { name: "Load (kg)", exact: true }),
  ).toHaveValue("40");
  await expect(
    page.getByRole("textbox", { name: "Reps", exact: true }),
  ).toHaveValue("8");
  await expect(
    page.getByRole("button", { name: "Done", exact: true }),
  ).toBeVisible();
  page.once("dialog", (dialog) => dialog.dismiss());
  await page
    .getByRole("button", { name: "Finish workout", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Finish workout", exact: true }),
  ).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("button", { name: "Finish workout", exact: true })
    .click();
  await page.getByRole("tab", { name: "train", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Review / edit", exact: true }),
  ).toHaveCount(1);
  await page.getByRole("tab", { name: "explore", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Search exercises" })
    .fill("Barbell Bench Press");
  await expect(
    page.getByRole("button", { name: "View Barbell Bench Press", exact: true }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "progress", exact: true }).click();
  await expect(page.getByText("Training trend", { exact: true })).toBeVisible();
  await page.getByRole("tab", { name: "You", exact: true }).click();
  const downloading = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export JSON backup" }).click();
  const download = await downloading;
  const text = await readFile((await download.path())!, "utf8");
  const backup = JSON.parse(text);
  expect(backup.workouts).toHaveLength(1);
  expect(backup.sets[0]).toMatchObject({
    weight: 40,
    reps: 8,
    completed: true,
  });

  // Cancel must preserve history; accepting removes only this browser's data.
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByRole("button", { name: "Delete all local data" }).click();
  await expect(
    page.getByRole("button", { name: "Export JSON backup" }),
  ).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Delete all local data" }).click();
  await page
    .getByRole("textbox", { name: "Height (feet)", exact: true })
    .fill("5");
  await page
    .getByRole("textbox", { name: "Height (inches)", exact: true })
    .fill("10");
  await page
    .getByRole("textbox", {
      name: "Starting weight (kg, required)",
      exact: true,
    })
    .fill("75");
  await page
    .getByRole("button", { name: "Skip remaining optional setup" })
    .click();
  await page.getByRole("tab", { name: "You", exact: true }).click();
  page.once("dialog", (dialog) => dialog.accept());
  const choosing = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Import JSON backup" }).click();
  await (
    await choosing
  ).setFiles({
    name: "backup.json",
    mimeType: "application/json",
    buffer: Buffer.from(text),
  });
  await page.getByRole("tab", { name: "train", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Review / edit", exact: true }),
  ).toHaveCount(1);
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Review / edit", exact: true }),
  ).toHaveCount(1);
  expect(errors).toEqual([]);
});
