import type { Metadata, Viewport } from "next";
import { connection } from "next/server";
import { Geist, Geist_Mono, Nunito } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const geistSans = Geist({ variable: "--font-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
// Rounded display face for headings, labels and buttons; Geist stays for body text and numbers.
const nunito = Nunito({ variable: "--font-display", subsets: ["latin"], weight: ["700", "800", "900"] });

export const metadata: Metadata = {
  title: { default: "PhD Companion", template: "%s · PhD Companion" },
  description: "A private place to record, organise and find your PhD work.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#fbfaf6",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Render every page per request: each response carries a fresh CSP nonce (see proxy.ts),
  // which a page built ahead of time can't have.
  await connection();
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} ${nunito.variable} h-full antialiased`}>
      <body className="min-h-full bg-background text-foreground">
        {children}
        <Toaster position="bottom-center" />
      </body>
    </html>
  );
}
