import { test, expect } from "@playwright/test";
import { localDate } from "../../src/domain/types";
import { addDays } from "../../src/domain/paths/model";

test("personalize a Path, save it, log a linked workout and manage its schedule offline", async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await page
    .getByRole("button", { name: "Skip optional setup · use guest defaults" })
    .click();
  await page.getByRole("tab", { name: "train", exact: true }).click();
  await page.getByRole("button", { name: "Forge Paths", exact: true }).click();
  await page
    .getByRole("button", { name: "Choose START STRONG", exact: true })
    .click();
  await page.getByRole("button", { name: "Next step", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Find an exercise to exclude" })
    .fill("Goblet Squat");
  await page
    .getByRole("button", { name: "Exclude Goblet Squat", exact: true })
    .click();
  await page.getByRole("button", { name: "Next step", exact: true }).click();
  await page.getByRole("button", { name: "hinge", exact: true }).click();
  await page
    .getByRole("button", { name: "Preview my eight-week plan" })
    .click();
  await expect(
    page.getByText("Your plan, before you commit.", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Goblet Squat", { exact: true })).toHaveCount(0);
  page.once("dialog", (dialog) => dialog.dismiss());
  await page
    .getByRole("button", { name: "Start this Path", exact: true })
    .click();
  await expect(
    page.getByText("Your plan, before you commit.", { exact: true }),
  ).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("button", { name: "Start this Path", exact: true })
    .click();
  await expect(
    page.getByText("0 / 24 workouts completed", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("YOUR CURRENT PATH", { exact: true }),
  ).toBeInViewport();
  await page.reload();
  await expect(
    page.getByText("0 / 24 workouts completed", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Start next Path workout", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Complete", exact: true })
    .first()
    .click();
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("button", { name: "Finish workout", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Review / edit", exact: true }),
  ).toHaveCount(1);
  await page
    .getByRole("button", { name: "Open your Path", exact: true })
    .click();
  await context.setOffline(true);
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Pause Path", exact: true }).click();
  await expect(
    page
      .getByText("Paused · your progress is safe", { exact: true })
      .filter({ visible: true }),
  ).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Resume Path", exact: true }).click();
  await page.getByRole("button", { name: "Week 1", exact: true }).click();
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("button", { name: "Skip Full body B", exact: true })
    .click();
  await expect(
    page.getByText(/1 skipped/).filter({ visible: true }),
  ).toBeVisible();
  await expect(
    page
      .getByText("1 / 24 workouts completed", { exact: true })
      .filter({ visible: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Move Full body B", exact: true })
    .click();
  const nextDate = addDays(localDate(), 70);
  await page
    .getByRole("textbox", { name: "New session date (YYYY-MM-DD)" })
    .fill(nextDate);
  await page
    .getByRole("button", { name: "Save new session date", exact: true })
    .click();
  await expect(
    page
      .getByText(`${nextDate} · scheduled`, { exact: true })
      .filter({ visible: true }),
  ).toBeVisible();
  await expect(
    page
      .getByText("1 / 24 workouts completed", { exact: true })
      .filter({ visible: true }),
  ).toBeVisible();
  await context.setOffline(false);
  await page.reload();
  await expect(
    page
      .getByText("1 / 24 workouts completed", { exact: true })
      .filter({ visible: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
