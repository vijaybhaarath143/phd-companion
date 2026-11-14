import Link from "next/link";
import { cn } from "cn";

/** Projects · Publications · Benchwork — the three ways into Research. */
export function ResearchTabs({ current, projectHref }: { current: "projects" | "publications" | "benchwork"; projectHref: string }) {
  const tab = (key: typeof current, label: string, href: string) => (
    <Link
      href={href}
      aria-current={current === key ? "page" : undefined}
      className={cn("-mb-px inline-flex h-10 items-center border-b-2 px-0.5 font-medium", current === key ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}
    >
      {label}
    </Link>
  );
  return (
    <nav aria-label="Research views" data-guide="research-views" className="flex gap-5 border-b">
      {tab("projects", "Projects", projectHref)}
      {tab("publications", "Publications", "/research?view=publications")}
      {tab("benchwork", "Benchwork", "/research?view=benchwork")}
    </nav>
  );
}
