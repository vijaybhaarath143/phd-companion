"use client";

import { useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { AppSelect } from "@/components/app/app-select";
import { ActionForm } from "@/components/app/action-form";
import { Evidence } from "@/components/app/evidence";
import { callAction, quickAction, trashWithUndo } from "@/components/app/call-action";
import { undoRemove } from "@/server/actions/settings";
import { toOptions } from "@/lib/options";
import { formatFullDay } from "@/lib/dates";
import { addTrial, removeTrial, updateTrial } from "@/server/actions/research";
import type { Trial } from "@/server/research";

const OUTCOMES = { worked: "Worked", did_not_work: "Didn't work", inconclusive: "Inconclusive" } as const;

/** Each run of the experiment: when, under what conditions, what happened, and its own records. */
export function Trials({ entryId, trials }: { entryId: string; trials: Trial[] }) {
  const [open, setOpen] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const counts = { worked: 0, did_not_work: 0, inconclusive: 0 };
  for (const t of trials) if (t.outcome) counts[t.outcome]++;

  return (
    <section data-guide="trials" className="flex flex-col gap-3 rounded-2xl border-2 bg-card shadow-edge px-5 py-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-extrabold">Trials{trials.length ? ` · ${trials.length}` : ""}</h2>
          <p className="text-[13px] text-muted-foreground">
            {trials.length
              ? `${counts.worked} worked · ${counts.did_not_work} didn't work · ${counts.inconclusive} inconclusive`
              : "Each run of this experiment, with its own date, conditions, result and files."}
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          disabled={pending}
          onClick={() => start(async () => {
            const r = await callAction(() => addTrial(entryId));
            if (r && r.ok) setOpen(r.data);
            else if (r && !r.ok) await quickAction(async () => r);
          })}
        >
          <Plus aria-hidden /> Add trial
        </Button>
      </div>
      {trials.length > 0 && (
        <ul className="divide-y-2 divide-zinc-100 border-t-2 border-zinc-100">
          {trials.map((t) => (
            <li key={t.id}>
              <button type="button" onClick={() => setOpen(open === t.id ? null : t.id)} aria-expanded={open === t.id} className="flex w-full items-center gap-3 py-3 text-left">
                <span className="w-16 shrink-0 font-semibold tabular-nums">Trial {t.trialNo}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{t.result || <span className="text-muted-foreground">No result yet</span>}</span>
                  <span className="block text-[13px] text-muted-foreground">
                    {[t.runOn ? formatFullDay(t.runOn) : "no date", t.evidence.length ? `${t.evidence.length} file${t.evidence.length > 1 ? "s" : ""} or links` : null].filter(Boolean).join(" · ")}
                  </span>
                </span>
                <Badge variant={t.outcome ? "outline" : "muted"}>{t.outcome ? OUTCOMES[t.outcome] : "Not recorded"}</Badge>
              </button>
              {open === t.id && (
                <div className="mb-4 flex flex-col gap-4 rounded-xl border-2 bg-zinc-50 p-4">
                  <ActionForm action={updateTrial.bind(null, t.id)} success="Trial saved" reset={false} onDone={() => setOpen(null)} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <input type="hidden" name="version" value={t.version} />
                    <div className="flex flex-col gap-1.5">
                      <label className="text-sm font-medium" htmlFor={`tr-d-${t.id}`}>Run on</label>
                      <Input id={`tr-d-${t.id}`} type="date" name="runOn" defaultValue={t.runOn ?? ""} />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-sm font-medium" htmlFor={`tr-o-${t.id}`}>Outcome</label>
                      <AppSelect id={`tr-o-${t.id}`} name="outcome" defaultValue={t.outcome ?? ""} options={toOptions(OUTCOMES, "Not recorded")} />
                    </div>
                    <div className="flex flex-col gap-1.5 sm:col-span-2">
                      <label className="text-sm font-medium" htmlFor={`tr-c-${t.id}`}>Conditions</label>
                      <Textarea id={`tr-c-${t.id}`} name="conditions" rows={2} defaultValue={t.conditions ?? ""} placeholder="Electrode, concentration, temperature — anything that differs from the last trial" />
                    </div>
                    <div className="flex flex-col gap-1.5 sm:col-span-2">
                      <label className="text-sm font-medium" htmlFor={`tr-r-${t.id}`}>Result</label>
                      <Textarea id={`tr-r-${t.id}`} name="result" rows={3} defaultValue={t.result ?? ""} placeholder="What you observed or measured" />
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2 sm:col-span-2">
                      <div className="flex gap-2">
                        <Button type="submit">Save</Button>
                        <Button type="button" variant="ghost" onClick={() => setOpen(null)}>Close</Button>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        disabled={pending}
                        onClick={() => start(async () => {
                          if (await trashWithUndo({ what: `Trial ${t.trialNo}`, removed: true, trash: () => removeTrial(t.id), undo: () => undoRemove("trial", t.id) })) setOpen(null);
                        })}
                      >
                        Remove trial
                      </Button>
                    </div>
                  </ActionForm>
                  <div className="flex flex-col gap-2 border-t border-zinc-200 pt-3">
                    <h3 className="text-sm font-medium">Records for trial {t.trialNo}</h3>
                    <Evidence items={t.evidence} parentType="trial" parentId={t.id} hint="Raw data, photos, instrument output." />
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
