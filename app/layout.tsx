import type { Metadata } from "next";
import { Fraunces, JetBrains_Mono } from "next/font/google";
import Navbar from "@/components/nav/Navbar";
import "./globals.css";

/**
 * Fraunces — variable serif with optical-size + softness axes: sharpens
 * optically at text sizes, relaxes at display sizes. The closest free
 * expression of "hand-finished precision" (brand doc asks for Editorial
 * New / GT Super). Exposed as --font-crimson for CSS-var continuity.
 */
const fraunces = Fraunces({
  weight: "variable",
  style: ["normal", "italic"],
  subsets: ["latin"],
  variable: "--font-crimson",
  display: "swap",
  axes: ["opsz", "SOFT", "WONK"],
});

const jetbrainsMono = JetBrains_Mono({
  weight: ["400", "500", "600"],
  subsets: ["latin"],
  variable: "--font-jetbrains",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Nutritional Tracker",
  description: "Personal nutrition tracking",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${fraunces.variable} ${jetbrainsMono.variable}`}>
      <body>
        <Navbar />
        <main className="app-container">{children}</main>
      </body>
    </html>
  );
}
