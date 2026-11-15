"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "cn";
import { BookOpen, CalendarDays, FlaskConical, GraduationCap, History, Home, Menu, NotebookPen, Plus, Search, ShieldCheck, SlidersHorizontal, Users } from "lucide-react";
import { useQuickAdd } from "@/components/app/quick-add";
import { GuideMeButton } from "@/components/app/guide";
import { IconTile, type AreaTone } from "@/components/app/ui";
import { Brand } from "@/components/app/brand";

const items = [
  { tone: "leaf" as AreaTone, href: "/", label: "Home", icon: Home, match: (p: string) => p === "/" },
  { tone: "neutral" as AreaTone, href: "/timeline", label: "Timeline", icon: History, match: (p: string) => p.startsWith("/timeline") },
  { tone: "sky" as AreaTone, href: "/journal", label: "Journal", icon: BookOpen, match: (p: string) => p.startsWith("/journal") },
  { tone: "leaf" as AreaTone, href: "/research", label: "Research", icon: FlaskConical, match: (p: string) => p.startsWith("/research") },
  { tone: "sun" as AreaTone, href: "/planner", label: "Planner", icon: CalendarDays, match: (p: string) => p.startsWith("/planner") },
  { tone: "grape" as AreaTone, href: "/academics", label: "Academics", icon: GraduationCap, match: (p: string) => p.startsWith("/academics") },
  { tone: "clay" as AreaTone, href: "/events", label: "Events", icon: Users, match: (p: string) => p.startsWith("/events") },
  { tone: "neutral" as AreaTone, href: "/notes", label: "Notes", icon: NotebookPen, match: (p: string) => p.startsWith("/notes") },
];

export function Sidebar({ name, department, phdTitle, isAdmin = false }: { name: string; department: string | null; phdTitle: string | null; isAdmin?: boolean }) {
  const path = usePathname();
  const { open } = useQuickAdd();
  return (
    <nav aria-label="Main" className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col gap-5 overflow-y-auto border-r-2 bg-sidebar px-4 py-6 md:flex">
      <Brand href="/" className="px-1.5" />
      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={() => open()}
          data-guide="quick-add"
          className="flex h-12 items-center justify-center gap-2 rounded-xl bg-primary font-display font-extrabold tracking-[0.02em] text-primary-foreground shadow-[0_4px_0_var(--primary-edge)] transition-transform duration-75 active:translate-y-1 active:shadow-none motion-reduce:transition-none"
        >
          <Plus className="size-[18px]" strokeWidth={2.8} aria-hidden /> Quick Add
        </button>
        <Link href="/journal?search=1" data-guide="search" className="flex h-11 items-center gap-2 rounded-xl border-2 bg-card px-3.5 text-muted-foreground transition-colors hover:text-foreground">
          <Search className="size-4" aria-hidden /> Search everything
        </Link>
      </div>
      <ul data-guide="nav" className="flex flex-col gap-1">
        {items.map((it) => {
          const active = it.match(path);
          return (
            <li key={it.href}>
              <Link
                href={it.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-11 items-center gap-3 rounded-xl border-2 px-2 font-display text-[15px] font-extrabold transition-colors",
                  active ? "border-sky-soft bg-sky-soft text-sky-strong" : "border-transparent text-zinc-700 hover:bg-zinc-100 hover:text-foreground",
                )}
              >
                <IconTile tone={it.tone} size="sm"><it.icon strokeWidth={2.4} /></IconTile> {it.label}
              </Link>
            </li>
          );
        })}
      </ul>
      <Link href="/settings#profile" className="mt-auto flex flex-col gap-1 rounded-2xl border-2 bg-background px-3.5 py-3 transition-colors hover:bg-zinc-50">
        <span className="font-display text-[11px] font-extrabold tracking-[0.08em] text-muted-foreground uppercase">Your PhD</span>
        <span className={cn("line-clamp-3 font-display text-[13px] leading-snug font-bold", !phdTitle && "text-sky")}>{phdTitle ?? "Add your PhD title"}</span>
      </Link>
      <div className="flex flex-col gap-1 border-t-2 pt-3">
        <GuideMeButton className="flex h-10 items-center gap-2.5 rounded-xl px-2.5 font-display font-bold text-zinc-700 transition-colors hover:bg-zinc-100" />
        <Link
          href="/settings"
          aria-current={path.startsWith("/settings") ? "page" : undefined}
          className={cn(
            "flex h-10 items-center gap-2.5 rounded-xl px-2.5 font-display font-bold transition-colors",
            path.startsWith("/settings") ? "bg-sky-soft text-sky-strong" : "text-zinc-700 hover:bg-zinc-100",
          )}
        >
          <SlidersHorizontal className="size-4" aria-hidden /> Settings
        </Link>
        {isAdmin && (
          <Link href="/admin" className="flex h-10 items-center gap-2.5 rounded-xl px-2.5 font-display font-bold text-zinc-700 transition-colors hover:bg-zinc-100">
            <ShieldCheck className="size-4" aria-hidden /> Admin
          </Link>
        )}
        <div className="flex items-center gap-2.5 px-2.5 py-2">
          <div aria-hidden className="flex size-9 shrink-0 items-center justify-center rounded-full bg-grape-soft font-display text-[14px] font-black text-grape-strong">
            {(name || "?").slice(0, 1).toUpperCase()}
          </div>
          <div className="flex min-w-0 flex-col">
            <span className="truncate font-display font-extrabold">{name || "Your name"}</span>
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
      className={cn("flex h-14 flex-1 flex-col items-center justify-center gap-1 font-display text-[11px] font-extrabold", active ? "text-sky-strong" : "text-zinc-600")}
    >
      <Icon className={cn("size-6", active && "fill-sky-soft text-sky")} strokeWidth={2.3} aria-hidden />
      {label}
    </Link>
  );
  const moreActive = ["/journal", "/research", "/academics", "/events", "/notes", "/settings", "/more"].some((p) => path.startsWith(p));
  return (
    <nav aria-label="Main" data-guide="nav" className="fixed inset-x-0 bottom-0 z-40 flex items-center border-t-2 bg-card px-2 pb-[max(env(safe-area-inset-bottom),8px)] md:hidden">
      {tab("/", "Home", Home, path === "/")}
      {tab("/timeline", "Timeline", History, path.startsWith("/timeline"))}
      <button
        type="button"
        aria-label="Quick Add"
        data-guide="quick-add"
        onClick={() => open()}
        className="mx-2 flex h-13 w-14 items-center justify-center rounded-[18px] bg-primary text-primary-foreground shadow-[0_4px_0_var(--primary-edge)] transition-transform duration-75 active:translate-y-1 active:shadow-none motion-reduce:transition-none"
      >
        <Plus className="size-6" strokeWidth={3} aria-hidden />
      </button>
      {tab("/planner", "Planner", CalendarDays, path.startsWith("/planner"))}
      {tab("/more", "More", Menu, moreActive)}
    </nav>
  );
}
