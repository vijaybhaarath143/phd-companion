import Link from "next/link";
import { cn } from "cn";

/** Publications · Benchwork — the two ways into Research. The PhD itself is the one project. */
export function ResearchTabs({ current }: { current: "publications" | "benchwork" }) {
  const tab = (key: typeof current, label: string, href: string) => (
    <Link
      href={href}
      aria-current={current === key ? "page" : undefined}
      className={cn("-mb-0.5 inline-flex h-11 items-center border-b-[3px] px-0.5 font-display font-extrabold", current === key ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}
    >
      {label}
    </Link>
  );
  return (
    <nav aria-label="Research views" data-guide="research-views" className="flex gap-6 border-b-2">
      {tab("publications", "Publications", "/research")}
      {tab("benchwork", "Benchwork", "/research?view=benchwork")}
    </nav>
  );
}
