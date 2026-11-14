import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { pendingEmail } from "@/server/actions/auth";
import { signInMode } from "@/lib/sign-in-mode";
import { VerifyForm } from "./verify-form";
import { CheckEmail } from "./check-email";

export const metadata: Metadata = { title: "Check your email" };

export default async function VerifyPage() {
  const email = await pendingEmail();
  if (!email) redirect("/sign-in");
  return signInMode() === "code" ? <VerifyForm email={email} /> : <CheckEmail email={email} />;
}
