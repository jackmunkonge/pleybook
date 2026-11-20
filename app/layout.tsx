import type { Metadata } from "next";
import { Fraunces, Geist, Geist_Mono, Newsreader } from "next/font/google";
import { Suspense } from "react";
import { UserBar } from "./user-bar";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  axes: ["SOFT", "WONK"],
  style: ["normal", "italic"],
});

// Document text (the "paper" in the review viewer).
const newsreader = Newsreader({
  variable: "--font-newsreader",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Pleybook · Contract risk reviewer",
  description: "Check a contract against your negotiation playbook, clause by clause, with verifiable citations.",
  // Orange mark under `next dev` so a local tab is never mistaken for the deployed app.
  icons: { icon: process.env.NODE_ENV === "development" ? "/icon-dev.svg" : "/icon.svg" },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${fraunces.variable} ${newsreader.variable} h-full antialiased`}
    >
      <body className="flex h-dvh flex-col">
        <Suspense fallback={null}>
          <UserBar />
        </Suspense>
        {children}
      </body>
    </html>
  );
}
