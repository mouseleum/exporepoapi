import type { Metadata } from "next";
import "./globals.css";

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
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
