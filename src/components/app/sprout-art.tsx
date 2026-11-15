import { Sprout } from "lucide-react";
import { cn } from "cn";

/** The app's sprout in a soft circle with a few confetti dots — decoration only. */
export function SproutArt({ className }: { className?: string }) {
  return (
    <span aria-hidden className={cn("relative inline-flex size-36 shrink-0 items-center justify-center", className)}>
      <span className="absolute inset-0 rounded-full bg-leaf-soft" />
      <span className="relative flex size-20 items-center justify-center rounded-[26px] bg-primary text-primary-foreground shadow-[0_5px_0_var(--primary-edge)]">
        <Sprout className="size-11" strokeWidth={2.2} />
      </span>
      <span className="absolute top-5 right-2 size-3 rotate-12 rounded-[4px] bg-sun-bright" />
      <span className="absolute top-12 left-1 size-2.5 rounded-full bg-sky" />
      <span className="absolute right-4 bottom-3 size-2.5 rounded-full bg-grape" />
      <span className="absolute bottom-6 left-3 h-2 w-3.5 -rotate-12 rounded-[3px] bg-berry-bright" />
    </span>
  );
}
