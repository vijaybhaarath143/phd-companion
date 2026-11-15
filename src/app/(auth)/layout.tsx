import { Sprout } from "lucide-react";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-dvh flex-col bg-background p-5 sm:p-6">
      <div className="flex items-center gap-2.5">
        <span aria-hidden className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-[0_3px_0_var(--primary-edge)]">
          <Sprout className="size-5" strokeWidth={2.4} />
        </span>
        <span className="font-display text-[16px] font-black">PhD Companion</span>
      </div>
      <main className="flex flex-1 items-center justify-center py-10">{children}</main>
    </div>
  );
}
