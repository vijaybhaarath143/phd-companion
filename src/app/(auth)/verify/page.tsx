import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { pendingEmail } from "@/server/actions/auth";
import { VerifyForm } from "./verify-form";

export const metadata: Metadata = { title: "Enter code" };

export default async function VerifyPage() {
  const email = await pendingEmail();
  if (!email) redirect("/sign-in");
  return <VerifyForm email={email} />;
}
