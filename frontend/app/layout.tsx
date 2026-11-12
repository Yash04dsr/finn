/*
  FINN design intent (v3 — Swiss International Style):
  1. Black on white. Helvetica. Square corners. 2px black top rules replace
     card borders and shadows — information ranks by weight and position.
  2. One accent: tan (#B38B6D) for hover rules and micro-details, never text.
     Data semantics keep bottle-green/oxblood for pos/neg numbers only.
  3. Grid discipline: uppercase letter-spaced micro-labels, tabular figures,
     light-weight display headings. Native-app feel: safe-area tab bar,
     square slide-up sheets.
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
  maximumScale: 5,
  userScalable: true,
  viewportFit: "cover",
  themeColor: "#FFFFFF",
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
