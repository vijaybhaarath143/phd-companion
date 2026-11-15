import type { MetadataRoute } from "next";

/**
 * Lets her add the app to her phone's home screen or install it on her laptop.
 * No service worker: private pages are never cached on the device.
 * (The sign-in proxy skips /manifest.webmanifest and /icon*.png, so these load signed out too.)
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "PhD Companion",
    short_name: "PhD Companion",
    description: "A private place to record, organise and find your PhD work.",
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#fbfaf6",
    theme_color: "#fbfaf6",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
