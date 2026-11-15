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
  title: "FINN",
  description: "A brief you finish, graded against management's own words.",
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
      <body className="min-h-dvh antialiased md:bg-[#F5F1E8]">
        {/* One phone-width column: native on phones, centred with margins on desktop. */}
        <div className="mx-auto min-h-dvh w-full max-w-[480px] bg-white md:border-x md:border-[#E5E7EB]">{children}</div>
        <TabBar />
        <SwRegister />
      </body>
    </html>
  );
}
