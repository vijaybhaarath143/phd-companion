import { notFound, redirect } from "next/navigation";
import { asUser } from "@/server/auth";
import { isUuid } from "@/lib/utils";

/**
 * Projects are gone: the PhD itself is the one project. An old link to a project goes to the
 * publication it became (where its review steps now live), else to Research.
 */
export default async function OldProjectPage({ params }: PageProps<"/research/projects/[id]">) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const [m] = await asUser((tx) => tx<{ id: string }[]>`
    select coalesce(
      (select r.manuscript_id from public.review_steps r where r.project_id = ${id} limit 1),
      (select m.id from public.manuscripts m where m.project_id = ${id} and m.deleted_at is null order by m.created_at limit 1)
    ) as id`);
  redirect(m?.id ? `/research/manuscripts/${m.id}` : "/research");
}
