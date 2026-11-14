import Link from "next/link";
import { Button } from "@/components/ui/button";

/** A record that isn't there (wrong link, or moved to Trash), shown inside the app's frame. */
export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-[560px] flex-col gap-4 rounded-xl border bg-card p-6">
      <h1 className="text-xl font-semibold tracking-[-0.01em]">This wasn&apos;t found</h1>
      <p className="text-muted-foreground">
        The link may be mistyped or out of date, or the record was moved to Trash. Things in Trash can be restored from Settings for 30 days.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button asChild><Link href="/">Go to Home</Link></Button>
        <Button asChild variant="outline"><Link href="/journal">Open Journal</Link></Button>
        <Button asChild variant="ghost"><Link href="/settings#trash">Open Trash</Link></Button>
      </div>
    </div>
  );
}
