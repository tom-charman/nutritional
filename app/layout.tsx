import type { Metadata } from "next";
import { headers } from "next/headers";
import { Fraunces, JetBrains_Mono } from "next/font/google";
import Navbar from "@/components/nav/Navbar";
import Footer from "@/components/nav/Footer";
import ConsentGate from "@/components/nav/ConsentGate";
import { auth } from "@/lib/auth";
import { needsHealthConsent } from "@/lib/data/consent";
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
  title: "Nutritional",
  description: "A precision instrument for what you eat.",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await auth();
  // In the local AUTH_DISABLED bypass (dev/e2e) there is no session, but the
  // account menu (and its Export action) must still render — surface the test
  // user so the nav matches the signed-in experience.
  const authDisabled =
    process.env.AUTH_DISABLED === "true" && process.env.NODE_ENV !== "production";
  const user = session?.user
    ? { name: session.user.name, email: session.user.email }
    : authDisabled
      ? { name: null, email: process.env.TEST_USER_EMAIL ?? null }
      : null;

  // Explicit health-data consent gate. The notice and contact form stay
  // reachable while ungated (x-pathname is set by proxy.ts) so a user can read
  // them before deciding; everything else is replaced by the gate until consent.
  const pathname = (await headers()).get("x-pathname") ?? "";
  const consentExempt = pathname === "/privacy" || pathname === "/contact";
  const showConsentGate = !consentExempt && (await needsHealthConsent());

  return (
    <html lang="en" className={`${fraunces.variable} ${jetbrainsMono.variable}`}>
      <body>
        <Navbar user={user} gated={showConsentGate} />
        <main className="app-container">
          {showConsentGate ? <ConsentGate /> : children}
        </main>
        <Footer />
      </body>
    </html>
  );
}
