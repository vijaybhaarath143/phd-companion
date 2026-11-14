import type { Metadata } from "next";
import { signInMode } from "@/lib/sign-in-mode";
import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  const sp = await searchParams;
  return <SignInForm mode={signInMode()} linkFailed={sp.error === "link"} />;
}
