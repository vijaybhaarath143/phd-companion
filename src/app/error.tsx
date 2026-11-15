"use client";

import Link from "next/link";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";

/** Errors outside the main app screens (sign-in, onboarding). */
export default function RootError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-dvh items-center justify-center bg-zinc-50 p-6">
      <div className="flex w-full max-w-[480px] flex-col gap-4 rounded-2xl border-2 bg-card shadow-edge p-8">
        <h1 className="text-2xl font-black">Something went wrong</h1>
        <p className="text-muted-foreground">Usually the connection dropped or the app was just updated. Nothing you saved is lost.</p>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => retry()}>Try again</Button>
          <Button asChild variant="outline"><Link href="/">Go to Home</Link></Button>
        </div>
      </div>
    </div>
  );
}
