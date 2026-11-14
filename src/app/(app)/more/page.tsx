import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, Compass, FlaskConical, GraduationCap, SlidersHorizontal } from "lucide-react";
import { GuideMeButton } from "@/components/app/guide";
import { PageHeader } from "@/components/app/ui";

export const metadata: Metadata = { title: "More" };

/** Phone-only menu for the areas that don't fit in the bottom bar. */
export default function MorePage() {
  const items = [
    { href: "/research", label: "Research", hint: "Projects, manuscripts, experiments", icon: FlaskConical },
    { href: "/academics", label: "Academics", hint: "Credits, courses, milestones, office enquiries", icon: GraduationCap },
    { href: "/settings", label: "Settings", hint: "Profile, export, trash, sign out", icon: SlidersHorizontal },
  ];
  return (
    <div className="mx-auto flex max-w-[640px] flex-col gap-5">
      <PageHeader title="More" />
      <ul className="divide-y divide-zinc-100 rounded-xl border bg-card">
        {items.map((it) => (
          <li key={it.href}>
            <Link href={it.href} className="flex min-h-16 items-center gap-3 px-5 py-3">
              <it.icon className="size-5 text-zinc-600" aria-hidden />
              <span className="flex-1"><span className="block font-medium">{it.label}</span><span className="block text-[13px] text-muted-foreground">{it.hint}</span></span>
              <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
      <div className="rounded-xl border bg-card">
        <GuideMeButton className="flex min-h-16 w-full items-center gap-3 px-5 py-3 text-left">
          <Compass className="size-5 text-zinc-600" aria-hidden />
          <span className="flex-1"><span className="block font-medium">Guide me</span><span className="block text-[13px] text-muted-foreground">A short tour of how everything works</span></span>
          <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
        </GuideMeButton>
      </div>
    </div>
  );
}
