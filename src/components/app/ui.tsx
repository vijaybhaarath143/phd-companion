import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "cn";
import { ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";

/** Small layout pieces shared by every screen (match the design canvas). */

export function PageHeader({ title, subtitle, eyebrow, actions }: { title: ReactNode; subtitle?: ReactNode; eyebrow?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="flex min-w-0 flex-1 basis-80 flex-col gap-1">
        {eyebrow && <div className="text-sm text-muted-foreground">{eyebrow}</div>}
        <h1 className="text-2xl leading-8 font-semibold tracking-[-0.015em] text-balance">{title}</h1>
        {subtitle && <p className="text-muted-foreground">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Section({ title, action, children, className, id, padded }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string; id?: string; padded?: boolean }) {
  return (
    <section id={id} className={cn("scroll-mt-6 rounded-xl border bg-card", className)}>
      {(title || action) && (
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-4 pb-3">
          {title && <h2 className="text-[15px] leading-6 font-semibold">{title}</h2>}
          {action}
        </div>
      )}
      <div className={cn(padded && "px-5 pb-5")}>{children}</div>
    </section>
  );
}

export function Rows({ children }: { children: ReactNode }) {
  return <ul className="divide-y divide-zinc-100 border-t border-zinc-100">{children}</ul>;
}

export function RowLink({ href, title, detail, badge, attention, leading }: { href: string; title: ReactNode; detail?: ReactNode; badge?: ReactNode; attention?: boolean; leading?: ReactNode }) {
  return (
    <li>
      <Link href={href} className="flex min-h-14 items-center gap-3 px-5 py-3 transition-colors hover:bg-zinc-50">
        {leading}
        <span className="min-w-0 flex-1">
          <span className="block font-medium">{title}</span>
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

export function Empty({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn("px-5 pb-5 text-sm text-muted-foreground", className)}>{children}</p>;
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
      <label htmlFor={htmlFor} className="text-sm font-medium">
        {label} {optional && <span className="font-normal text-muted-foreground">(optional)</span>}
      </label>
      {hint && <p className="-mt-1 text-[13px] text-muted-foreground">{hint}</p>}
      {children}
    </div>
  );
}
