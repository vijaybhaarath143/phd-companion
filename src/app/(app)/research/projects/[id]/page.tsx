import { notFound, redirect } from "next/navigation";
import { asUser } from "@/server/auth";
import { isUuid } from "@/lib/utils";

/**
 * Projects are gone: the PhD itself is the one project. An old link to a project goes to the
 * publication it became (where its review steps now live), to Benchwork if it was lab work,
 * else to Research.
 */
export default async function OldProjectPage({ params }: PageProps<"/research/projects/[id]">) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const [row] = await asUser((tx) => tx<{ manuscriptId: string | null; experiments: boolean }[]>`
    select
      (select m.id from public.manuscripts m where m.project_id = ${id} and m.deleted_at is null order by m.created_at limit 1) as manuscript_id,
      exists (select 1 from public.entries e where e.project_id = ${id} and e.kind = 'experiment' and e.deleted_at is null) as experiments`);
  redirect(row?.manuscriptId ? `/research/manuscripts/${row.manuscriptId}` : row?.experiments ? "/research?view=benchwork" : "/research");
}
