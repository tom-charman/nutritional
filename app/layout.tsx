import type { Metadata } from "next";
import { Crimson_Text, JetBrains_Mono } from "next/font/google";
import Navbar from "@/components/nav/Navbar";
import "./globals.css";

const crimsonText = Crimson_Text({
  weight: ["400", "600", "700"],
  style: ["normal", "italic"],
  subsets: ["latin"],
  variable: "--font-crimson",
  display: "swap",
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
    <html lang="en" className={`${crimsonText.variable} ${jetbrainsMono.variable}`}>
      <body>
        <Navbar />
        <main className="app-container">{children}</main>
      </body>
    </html>
  );
}
