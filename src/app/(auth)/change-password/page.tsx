import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { KeyRound } from "lucide-react";
import { asUser } from "@/server/auth";
import { getProfile } from "@/server/profile";
import { signOut } from "@/server/actions/auth";
import { Button } from "@/components/ui/button";
import { IconTile } from "@/components/app/ui";
import { ChangePasswordForm } from "@/components/app/change-password-form";

export const metadata: Metadata = { title: "Choose your password" };

/** First sign-in with a password the admin set: choose your own before anything else. */
export default async function ChangePasswordPage() {
  const profile = await asUser((tx) => getProfile(tx));
  if (!profile?.mustChangePassword) redirect("/");
  return (
    <div className="flex w-full max-w-[420px] flex-col gap-6 sm:rounded-3xl sm:border-2 sm:bg-card sm:p-8 sm:shadow-edge">
      <IconTile tone="sky" size="lg" className="self-center"><KeyRound /></IconTile>
      <div className="flex flex-col gap-2 text-center">
        <h1 className="text-[30px] leading-tight font-black">Choose your password</h1>
        <p className="text-[16px] text-muted-foreground">
          {profile.username ? <>You signed in as <span className="font-bold text-foreground">{profile.username}</span> with a temporary password. </> : "You signed in with a temporary password. "}
          Pick one only you know.
        </p>
      </div>
      <ChangePasswordForm next="home" submitLabel="Save and continue" wide />
      <form action={signOut} className="-mt-2">
        <Button type="submit" variant="ghost" className="w-full text-muted-foreground">Sign out</Button>
      </form>
    </div>
  );
}
