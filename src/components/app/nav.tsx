"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "cn";
import { BookOpen, CalendarDays, FlaskConical, GraduationCap, History, Home, Menu, NotebookPen, Plus, Search, SlidersHorizontal, Users } from "lucide-react";
import { useQuickAdd } from "@/components/app/quick-add";
import { GuideMeButton } from "@/components/app/guide";

const items = [
  { href: "/", label: "Home", icon: Home, match: (p: string) => p === "/" },
  { href: "/timeline", label: "Timeline", icon: History, match: (p: string) => p.startsWith("/timeline") },
  { href: "/journal", label: "Journal", icon: BookOpen, match: (p: string) => p.startsWith("/journal") },
  { href: "/research", label: "Research", icon: FlaskConical, match: (p: string) => p.startsWith("/research") },
  { href: "/planner", label: "Planner", icon: CalendarDays, match: (p: string) => p.startsWith("/planner") },
  { href: "/academics", label: "Academics", icon: GraduationCap, match: (p: string) => p.startsWith("/academics") },
  { href: "/events", label: "Events", icon: Users, match: (p: string) => p.startsWith("/events") },
  { href: "/notes", label: "Notes", icon: NotebookPen, match: (p: string) => p.startsWith("/notes") },
];

export function Sidebar({ name, department }: { name: string; department: string | null }) {
  const path = usePathname();
  const { open } = useQuickAdd();
  return (
    <nav aria-label="Main" className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col gap-4 overflow-y-auto border-r bg-sidebar px-3 py-5 md:flex">
      <Link href="/" className="px-2.5 text-[15px] font-semibold">PhD Companion</Link>
      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={() => open()}
          data-guide="quick-add"
          className="flex h-10 items-center justify-center gap-2 rounded-lg bg-primary font-medium text-primary-foreground transition-colors hover:bg-primary/85"
        >
          <Plus className="size-4" aria-hidden /> Quick Add
        </button>
        <Link href="/journal?search=1" data-guide="search" className="flex h-10 items-center gap-2 rounded-lg border bg-background px-3 text-muted-foreground transition-colors hover:text-foreground">
          <Search className="size-4" aria-hidden /> Search everything
        </Link>
      </div>
      <ul data-guide="nav" className="flex flex-col gap-0.5">
        {items.map((it) => {
          const active = it.match(path);
          return (
            <li key={it.href}>
              <Link
                href={it.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-9 items-center gap-2.5 rounded-lg px-2.5 transition-colors",
                  active ? "bg-zinc-200/70 font-medium text-foreground" : "text-zinc-700 hover:bg-zinc-100",
                )}
              >
                <it.icon className="size-4" aria-hidden /> {it.label}
              </Link>
            </li>
          );
        })}
      </ul>
      <div className="mt-auto flex flex-col gap-0.5 border-t pt-3">
        <GuideMeButton className="flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-zinc-700 transition-colors hover:bg-zinc-100" />
        <Link
          href="/settings"
          aria-current={path.startsWith("/settings") ? "page" : undefined}
          className={cn(
            "flex h-9 items-center gap-2.5 rounded-lg px-2.5 transition-colors",
            path.startsWith("/settings") ? "bg-zinc-200/70 font-medium" : "text-zinc-700 hover:bg-zinc-100",
          )}
        >
          <SlidersHorizontal className="size-4" aria-hidden /> Settings
        </Link>
        <div className="flex items-center gap-2.5 px-2.5 py-2">
          <div aria-hidden className="flex size-8 shrink-0 items-center justify-center rounded-full bg-zinc-200 text-[13px] font-semibold text-zinc-700">
            {(name || "?").slice(0, 1).toUpperCase()}
          </div>
          <div className="flex min-w-0 flex-col">
            <span className="truncate font-medium">{name || "Your name"}</span>
            {department && <span className="truncate text-xs text-muted-foreground">{department}</span>}
          </div>
        </div>
      </div>
    </nav>
  );
}

export function MobileNav() {
  const path = usePathname();
  const { open } = useQuickAdd();
  const tab = (href: string, label: string, Icon: typeof Home, active: boolean) => (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn("flex h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px]", active ? "font-semibold text-foreground" : "text-zinc-600")}
    >
      <Icon className="size-5" aria-hidden />
      {label}
    </Link>
  );
  const moreActive = ["/journal", "/research", "/academics", "/events", "/notes", "/settings", "/more"].some((p) => path.startsWith(p));
  return (
    <nav aria-label="Main" data-guide="nav" className="fixed inset-x-0 bottom-0 z-40 flex items-center border-t bg-background px-2 pb-[max(env(safe-area-inset-bottom),8px)] md:hidden">
      {tab("/", "Home", Home, path === "/")}
      {tab("/timeline", "Timeline", History, path.startsWith("/timeline"))}
      <button
        type="button"
        aria-label="Quick Add"
        data-guide="quick-add"
        onClick={() => open()}
        className="mx-2 flex size-13 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm"
      >
        <Plus className="size-6" aria-hidden />
      </button>
      {tab("/planner", "Planner", CalendarDays, path.startsWith("/planner"))}
      {tab("/more", "More", Menu, moreActive)}
    </nav>
  );
}
