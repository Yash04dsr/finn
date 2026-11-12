/*
  FINN design intent (v2 — research-desk editorial):
  1. Warm paper canvas (#f6f1e7) with ink text — reads like an equity research
     note. Serif display headings (system Georgia), sans body, tabular figures.
  2. One accent story: bottle green = capital at work / positive, oxblood = risk,
     ochre = attention. Flat ink-on-paper, no gradients, no glow, no emojis.
  3. Native-app feel on a phone: safe-area aware tab bar, slide-up sheets for
     detail, tabular-nums everywhere a number appears.
*/
import type { Metadata, Viewport } from "next";
import "./globals.css";
import TabBar from "@/components/TabBar";
import SwRegister from "@/components/SwRegister";

export const metadata: Metadata = {
  title: "FINN — Investment Intelligence",
  description:
    "Personal investment intelligence agent: filings, volume anomalies and an end-of-day digest, ranked by what actually matters.",
  applicationName: "FINN",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    apple: [{ url: "/icon.svg" }],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "FINN",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#f6f1e7",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh antialiased">
        {/* Center column on wide screens; native 1:1 on phones. */}
        <div className="mx-auto w-full max-w-[480px]">{children}</div>
        <TabBar />
        <SwRegister />
      </body>
    </html>
  );
}
