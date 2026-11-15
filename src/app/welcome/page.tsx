import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AppSelect } from "@/components/app/app-select";
import { monthOptions, valueOptions } from "@/lib/options";
import { asUser } from "@/server/auth";
import { getProfile } from "@/server/profile";
import { todayIn } from "@/lib/dates";
import { LiveSprig } from "@/components/app/sprig-live";
import { ContinueButton, SkipButton, WelcomeForm } from "./welcome-form";

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

export default async function WelcomePage({ searchParams }: PageProps<"/welcome">) {
  const sp = await searchParams;
  const step = Math.min(3, Math.max(1, Number(sp.step) || 1)) as 1 | 2 | 3;
  const profile = await asUser((tx) => getProfile(tx));
  if (profile?.onboardedAt) redirect("/");
  const today = todayIn(profile?.timezone ?? "Asia/Kolkata");
  const thisYear = Number(today.slice(0, 4));
  const startYear = profile?.programmeStart?.slice(0, 4);
  const startMonth = profile?.programmeStart?.slice(5, 7);
  const years = Array.from({ length: 16 }, (_, i) => String(thisYear - i));
  if (startYear && !years.includes(startYear)) years.push(startYear);

  return (
    <div className="flex min-h-dvh flex-col bg-zinc-50 p-6">
      <div className="text-[15px] font-semibold">PhD Companion</div>
      <main className="flex flex-1 items-center justify-center py-10">
        <div className="flex w-full max-w-[520px] flex-col gap-6 rounded-2xl border-2 bg-card shadow-edge p-8">
          <Steps step={step} />

          {step === 1 && (
            <WelcomeForm step={1}>
              <div className="flex flex-col gap-1.5">
                <LiveSprig mood="hello" className="mb-2 w-20" />
                <h1 className="text-[28px] leading-tight font-black md:text-[34px]">Welcome. What should we call you?</h1>
                <p className="text-muted-foreground">This is the only thing we need. Everything else can wait.</p>
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="name" className="text-sm font-medium">Your name</label>
                <Input id="name" name="name" autoComplete="name" required maxLength={120} defaultValue={profile?.displayName ?? ""} autoFocus />
              </div>
              {/* The main button comes first so pressing Enter continues rather than skips. */}
              <div className="flex flex-row-reverse items-center justify-between">
                <ContinueButton>Continue</ContinueButton>
                <SkipButton />
              </div>
            </WelcomeForm>
          )}

          {step === 2 && (
            <WelcomeForm step={2}>
              <div className="flex flex-col gap-1.5">
                <LiveSprig mood="happy" className="mb-2 w-20" />
                <h1 className="text-[28px] leading-tight font-black md:text-[34px]">Your programme</h1>
                <p className="text-muted-foreground">Fill in what you know. You can change any of this later in Settings.</p>
              </div>
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="university" className="text-sm font-medium">University</label>
                  <Input id="university" name="university" maxLength={200} defaultValue={profile?.university ?? ""} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="department" className="text-sm font-medium">Department</label>
                  <Input id="department" name="department" maxLength={200} defaultValue={profile?.department ?? ""} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="guide" className="text-sm font-medium">Research guide</label>
                  <Input id="guide" name="guide" maxLength={200} defaultValue={profile?.guideName ?? ""} />
                </div>
                <fieldset className="flex flex-col gap-1.5">
                  <legend className="mb-1.5 text-sm font-medium">Programme start</legend>
                  <div className="grid grid-cols-2 gap-2">
                    <AppSelect name="startMonth" aria-label="Month" defaultValue={startMonth ?? ""} options={monthOptions("Month")} />
                    <AppSelect name="startYear" aria-label="Year" defaultValue={startYear ?? ""} options={valueOptions(years, "Year")} />
                  </div>
                  <p className="text-[13px] text-muted-foreground">Month is enough — we don&apos;t need the exact day.</p>
                </fieldset>
              </div>
              {/* The main button comes first so pressing Enter continues rather than skips. */}
              <div className="flex flex-row-reverse items-center justify-between">
                <ContinueButton>Continue</ContinueButton>
                <Button asChild variant="ghost"><a href="/welcome?step=3">Skip</a></Button>
              </div>
            </WelcomeForm>
          )}

          {step === 3 && (
            <WelcomeForm step={3}>
              <div className="flex flex-col gap-1.5">
                <LiveSprig mood="curious" className="mb-2 w-20" />
                <h1 className="text-[28px] leading-tight font-black md:text-[34px]">What&apos;s your PhD about?</h1>
                <p className="text-muted-foreground">Your whole PhD is the one project here. A provisional title is fine — you can change it in Settings any time.</p>
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="phdTitle" className="text-sm font-medium">PhD title</label>
                <Input id="phdTitle" name="phdTitle" maxLength={300} defaultValue={profile?.phdTitle ?? ""} placeholder="Electrochemical biosensors for starch detection in foods" />
              </div>
              {/* The main button comes first so pressing Enter continues rather than skips. */}
              <div className="flex flex-row-reverse items-center justify-between">
                <ContinueButton>Finish</ContinueButton>
                <SkipButton />
              </div>
            </WelcomeForm>
          )}
        </div>
      </main>
    </div>
  );
}
