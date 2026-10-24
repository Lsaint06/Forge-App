import React from "react";
import { router } from "expo-router";
import { Screen, Empty, Button } from "../src/components/ui";

// Shown for a link to a page FORGE doesn't have, such as an old or mistyped
// link, instead of the developer "Unmatched Route" page.
export default function NotFound() {
  return (
    <Screen title="Page not found">
      <Empty
        title="This page doesn't exist"
        detail="The link may be old or mistyped. Your data is unchanged."
        action={
          <Button
            title="Go to Today"
            icon="home-outline"
            onPress={() => router.replace("/(tabs)")}
          />
        }
      />
    </Screen>
  );
}
