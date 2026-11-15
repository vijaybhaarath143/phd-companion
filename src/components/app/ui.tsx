import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "cn";
import { ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { SprigMood } from "@/components/app/sprig";
import { LiveSprig } from "@/components/app/sprig-live";

/** Small layout pieces shared by every screen (match the design canvas). */

export function PageHeader({ title, subtitle, eyebrow, actions }: { title: ReactNode; subtitle?: ReactNode; eyebrow?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="flex min-w-0 flex-1 basis-80 flex-col gap-1">
        {eyebrow && <div className="font-display text-xs font-extrabold tracking-[0.08em] text-muted-foreground uppercase">{eyebrow}</div>}
        <h1 className="text-[28px] leading-tight text-balance md:text-[34px]">{title}</h1>
        {subtitle && <p className="text-[15px] text-muted-foreground">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Section({ title, action, children, className, id, padded, guide }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string; id?: string; padded?: boolean; guide?: string }) {
  return (
    <section id={id} data-guide={guide} className={cn("scroll-mt-6 rounded-2xl border-2 bg-card shadow-edge", className)}>
      {(title || action) && (
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5 pb-3">
          {title && <h2 className="text-lg leading-6">{title}</h2>}
          {action}
        </div>
      )}
      <div className={cn(padded && "px-5 pb-5")}>{children}</div>
    </section>
  );
}

export function Rows({ children }: { children: ReactNode }) {
  return <ul className="divide-y-2 divide-zinc-100 border-t-2 border-zinc-100">{children}</ul>;
}

export function RowLink({ href, title, detail, badge, attention, leading }: { href: string; title: ReactNode; detail?: ReactNode; badge?: ReactNode; attention?: boolean; leading?: ReactNode }) {
  return (
    <li>
      <Link href={href} className="flex min-h-14 items-center gap-3 px-5 py-3 transition-colors last:rounded-b-2xl hover:bg-zinc-50">
        {leading}
        <span className="min-w-0 flex-1">
          <span className="block font-display text-[15px] font-bold">{title}</span>
          {detail && <span className="block text-[13px] text-muted-foreground">{detail}</span>}
        </span>
        {badge && <Badge variant={attention ? "attention" : "outline"}>{badge}</Badge>}
      </Link>
    </li>
  );
}

export function Row({ children, className }: { children: ReactNode; className?: string }) {
  return <li className={cn("flex min-h-14 items-center gap-3 px-5 py-3", className)}>{children}</li>;
}

/** A quiet "nothing here" line. Pass `sprig` for the few empty states worth a face (not every list). */
export function Empty({ children, className, sprig }: { children: ReactNode; className?: string; sprig?: SprigMood }) {
  if (!sprig) return <p className={cn("px-5 pb-5 text-sm text-muted-foreground", className)}>{children}</p>;
  return (
    <div className={cn("flex items-center gap-3 px-5 pb-5", className)}>
      <LiveSprig mood={sprig} className="w-14" />
      <p className="text-sm text-muted-foreground">{children}</p>
    </div>
  );
}

export function Breadcrumb({ items }: { items: { href?: string; label: string }[] }) {
  return (
    <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1 text-[13px] text-muted-foreground">
      {items.map((it, i) => (
        <span key={i} className="flex items-center gap-1">
          {i > 0 && <ChevronRight className="size-3.5" aria-hidden />}
          {it.href ? <Link href={it.href} className="hover:text-foreground hover:underline">{it.label}</Link> : <span>{it.label}</span>}
        </span>
      ))}
    </nav>
  );
}

export function Field({ label, htmlFor, hint, optional, children, className }: { label: string; htmlFor?: string; hint?: string; optional?: boolean; children: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={htmlFor} className="font-display text-sm font-extrabold">
        {label} {optional && <span className="font-normal text-muted-foreground">(optional)</span>}
      </label>
      {hint && <p className="-mt-1 text-[13px] text-muted-foreground">{hint}</p>}
      {children}
    </div>
  );
}

/** A soft tinted tile holding an icon, in one area's colour (matches the sidebar and Home cards). */
export function IconTile({ tone = "neutral", size = "md", children, className }: { tone?: AreaTone; size?: "sm" | "md" | "lg"; children: ReactNode; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex shrink-0 items-center justify-center",
        size === "sm" ? "size-8 rounded-[10px] [&_svg]:size-4" : size === "lg" ? "size-14 rounded-2xl [&_svg]:size-7" : "size-10 rounded-xl [&_svg]:size-5",
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export type AreaTone = "leaf" | "sky" | "sun" | "berry" | "grape" | "clay" | "neutral";

/** One colour per meaning: Leaf research/done, Sky journal/info, Sun attention/planner, Berry overdue, Grape academics, Clay events. */
const TONES: Record<AreaTone, string> = {
  leaf: "bg-leaf-soft text-primary",
  sky: "bg-sky-soft text-sky",
  sun: "bg-attention text-sun-strong",
  berry: "bg-overdue text-overdue-foreground",
  grape: "bg-grape-soft text-grape",
  clay: "bg-clay-soft text-clay",
  neutral: "bg-muted text-zinc-700",
};

/**
 * A card header's "go to" link as a small icon button showing the destination's icon.
 * The label is read by screen readers and shown as a tooltip on hover and keyboard focus.
 */
export function IconLink({ href, label, children, className }: { href: string; label: string; children: ReactNode; className?: string }) {
  return (
    <Link
      href={href}
      aria-label={label}
      className={cn(
        "group/iconlink relative flex size-9 shrink-0 items-center justify-center rounded-lg border-2 bg-card text-zinc-700 shadow-[0_3px_0_var(--border)] transition-transform duration-75 outline-none hover:bg-zinc-50 hover:text-foreground focus-visible:ring-4 focus-visible:ring-sky-soft active:translate-y-[3px] active:shadow-none motion-reduce:transition-none [&_svg]:size-[18px]",
        className,
      )}
    >
      {children}
      <span
        aria-hidden
        className="pointer-events-none absolute top-full right-0 z-20 mt-2 rounded-lg bg-zinc-900 px-2 py-1 font-display text-xs font-bold whitespace-nowrap text-white opacity-0 transition-opacity group-hover/iconlink:opacity-100 group-focus-visible/iconlink:opacity-100"
      >
        {label}
      </span>
    </Link>
  );
}
