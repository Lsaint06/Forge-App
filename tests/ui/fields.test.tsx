import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import { NumberField } from "../../src/components/ui";
test("numeric workout edit is persisted while typing without losing a zero value", async () => {
  const values: (number | null)[] = [];
  const screen = await render(
    <NumberField label="Load" value={20} onSave={(n) => values.push(n)} />,
  );
  const field = screen.getByLabelText("Load");
  await fireEvent(field, "focus");
  await fireEvent.changeText(field, "25");
  await fireEvent.changeText(field, "0");
  expect(values).toEqual([25, 0]);
});
test("invalid workout number never reaches persistence", async () => {
  const values: (number | null)[] = [];
  const screen = await render(
    <NumberField
      label="Reps"
      value={8}
      integer
      max={1000}
      onSave={(n) => values.push(n)}
    />,
  );
  const field = screen.getByLabelText("Reps");
  await fireEvent(field, "focus");
  await fireEvent.changeText(field, "NaN");
  await fireEvent.changeText(field, "-2");
  await fireEvent.changeText(field, "1.5");
  expect(values).toEqual([]);
  expect(screen.getByText("Enter a whole number from 0 to 1000")).toBeTruthy();
});
