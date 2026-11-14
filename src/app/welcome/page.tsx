import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { asUser } from "@/server/auth";
import { getProfile } from "@/server/profile";
import { createFirstProject, finishOnboarding, saveName, saveProgramme } from "@/server/actions/onboarding";
import { monthNames, todayIn } from "@/lib/dates";
import { projectTypes } from "@/lib/labels";

export const metadata: Metadata = { title: "Welcome" };

function Steps({ step }: { step: number }) {
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex gap-1.5" aria-hidden>
        {[1, 2, 3].map((i) => (
          <span key={i} className={`h-1 flex-1 rounded-full ${i <= step ? "bg-primary" : "bg-zinc-200"}`} />
        ))}
      </div>
      <p className="text-[13px] text-muted-foreground">Step {step} of 3{step > 1 ? " · optional" : ""}</p>
    </div>
  );
}

function Skip({ to }: { to?: string }) {
  return to ? (
    <Button asChild variant="ghost"><a href={to}>Skip</a></Button>
  ) : (
    // A second submit button on the same form, sent to a different action (no nested forms).
    <Button type="submit" variant="ghost" formAction={finishOnboarding} formNoValidate>Skip setup</Button>
  );
}

export default async function WelcomePage({ searchParams }: PageProps<"/welcome">) {
  const sp = await searchParams;
  const step = Math.min(3, Math.max(1, Number(sp.step) || 1));
  const profile = await asUser((tx) => getProfile(tx));
  if (profile?.onboardedAt) redirect("/");
  const today = todayIn(profile?.timezone ?? "Asia/Kolkata");
  const thisYear = Number(today.slice(0, 4));
  const startYear = profile?.programmeStart?.slice(0, 4);
  const startMonth = profile?.programmeStart?.slice(5, 7);

  return (
    <div className="flex min-h-dvh flex-col bg-zinc-50 p-6">
      <div className="text-[15px] font-semibold">PhD Companion</div>
      <main className="flex flex-1 items-center justify-center py-10">
        <div className="flex w-full max-w-[520px] flex-col gap-6 rounded-xl border bg-card p-8">
          <Steps step={step} />

          {step === 1 && (
            <form action={saveName} className="flex flex-col gap-6">
              <div className="flex flex-col gap-1.5">
                <h1 className="text-2xl leading-8 font-semibold tracking-[-0.015em]">Welcome. What should we call you?</h1>
                <p className="text-muted-foreground">This is the only thing we need. Everything else can wait.</p>
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="name" className="text-sm font-medium">Your name</label>
                <Input id="name" name="name" autoComplete="name" required maxLength={120} defaultValue={profile?.displayName ?? ""} autoFocus />
              </div>
              {/* The main button comes first so pressing Enter continues rather than skips. */}
              <div className="flex flex-row-reverse items-center justify-between">
                <Button type="submit">Continue</Button>
                <Skip />
              </div>
            </form>
          )}

          {step === 2 && (
            <form action={saveProgramme} className="flex flex-col gap-6">
              <div className="flex flex-col gap-1.5">
                <h1 className="text-2xl leading-8 font-semibold tracking-[-0.015em]">Your programme</h1>
                <p className="text-muted-foreground">Fill in what you know. You can change any of this later in Settings.</p>
              </div>
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="university" className="text-sm font-medium">University</label>
                  <Input id="university" name="university" defaultValue={profile?.university ?? ""} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="department" className="text-sm font-medium">Department</label>
                  <Input id="department" name="department" defaultValue={profile?.department ?? ""} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="guide" className="text-sm font-medium">Research guide</label>
                  <Input id="guide" name="guide" defaultValue={profile?.guideName ?? ""} />
                </div>
                <fieldset className="flex flex-col gap-1.5">
                  <legend className="mb-1.5 text-sm font-medium">Programme start</legend>
                  <div className="grid grid-cols-2 gap-2">
                    <NativeSelect name="startMonth" aria-label="Month" defaultValue={startMonth ?? ""}>
                      <option value="">Month</option>
                      {monthNames.map((m, i) => <option key={m} value={String(i + 1).padStart(2, "0")}>{m}</option>)}
                    </NativeSelect>
                    <NativeSelect name="startYear" aria-label="Year" defaultValue={startYear ?? ""}>
                      <option value="">Year</option>
                      {Array.from({ length: 10 }, (_, i) => String(thisYear - i)).map((y) => <option key={y} value={y}>{y}</option>)}
                    </NativeSelect>
                  </div>
                  <p className="text-[13px] text-muted-foreground">Month is enough — we don&apos;t need the exact day.</p>
                </fieldset>
              </div>
              {/* The main button comes first so pressing Enter continues rather than skips. */}
              <div className="flex flex-row-reverse items-center justify-between">
                <Button type="submit">Continue</Button>
                <Skip to="/welcome?step=3" />
              </div>
            </form>
          )}

          {step === 3 && (
            <form action={createFirstProject} className="flex flex-col gap-6">
              <div className="flex flex-col gap-1.5">
                <h1 className="text-2xl leading-8 font-semibold tracking-[-0.015em]">Add something you&apos;re working on</h1>
                <p className="text-muted-foreground">A project groups related notes, tasks and manuscripts. A title is all it needs.</p>
              </div>
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="title" className="text-sm font-medium">Project title</label>
                  <Input id="title" name="title" maxLength={300} placeholder="e.g. Literature review on …" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="type" className="text-sm font-medium">Type <span className="font-normal text-muted-foreground">(optional)</span></label>
                  <NativeSelect id="type" name="type" defaultValue="">
                    <option value="">Not sure</option>
                    {Object.entries(projectTypes).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </NativeSelect>
                </div>
              </div>
              {/* The main button comes first so pressing Enter continues rather than skips. */}
              <div className="flex flex-row-reverse items-center justify-between">
                <Button type="submit">Finish</Button>
                <Skip />
              </div>
            </form>
          )}
        </div>
      </main>
    </div>
  );
}
