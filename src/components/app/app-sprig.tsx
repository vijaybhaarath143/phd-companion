"use client";

import { useQuickAdd } from "@/components/app/quick-add";
import { SprigDock } from "@/components/app/sprig-dock";

/** Sprig in the app's frame, where Quick Add is at hand. (Admin uses SprigDock on its own.) */
export function AppSprig() {
  const { open } = useQuickAdd();
  return <SprigDock onQuickAdd={() => open()} />;
}
