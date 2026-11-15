import type { Metadata } from "next";
import { headers } from "next/headers";
import { signInMode } from "@/lib/sign-in-mode";
import { captchaSiteKey, TURNSTILE_ORIGIN } from "@/lib/captcha";
import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  const sp = await searchParams;
  const siteKey = captchaSiteKey();
  const nonce = siteKey ? ((await headers()).get("x-nonce") ?? undefined) : undefined;
  return (
    <>
      {siteKey && <script src={`${TURNSTILE_ORIGIN}/turnstile/v0/api.js`} nonce={nonce} async defer />}
      <SignInForm mode={signInMode()} notice={sp.error === "link" ? "link" : sp.error === "suspended" ? "suspended" : null} captchaSiteKey={siteKey} />
    </>
  );
}
