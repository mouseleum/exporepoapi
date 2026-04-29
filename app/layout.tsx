import type { Metadata } from "next";
import { Syne, DM_Mono, Chakra_Petch } from "next/font/google";
import "./globals.css";

const syne = Syne({
  subsets: ["latin"],
  weight: ["400", "600", "700", "800"],
  variable: "--font-syne",
});

const dmMono = DM_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono",
});

const chakraPetch = Chakra_Petch({
  subsets: ["latin"],
  weight: ["300", "400", "600"],
  variable: "--font-display",
});

export const metadata: Metadata = {
  title: "eXpotential — Exhibitor Tools",
  description: "AI-powered trade show exhibitor scoring and intelligence.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${syne.variable} ${dmMono.variable} ${chakraPetch.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
