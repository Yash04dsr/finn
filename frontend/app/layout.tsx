/*
  FINN design intent:
  1. Mobile-first "terminal calm" — a single dark canvas (#0A0E14) where information
     density is the luxury: every pixel carries a fact, hierarchy comes from
     type weight and thin priority rails, never from decoration.
  2. One accent story: emerald = capital at work / positive, rose = risk,
     amber = attention. No gradients, no emojis — trust is earned with restraint.
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
    statusBarStyle: "black-translucent",
    title: "FINN",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#0A0E14",
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
