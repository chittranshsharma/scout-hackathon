import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

// System-first stack (system-ui/-apple-system resolves to real SF Pro on Apple
// platforms); Inter is the loaded web fallback everywhere else.
const inter = Inter({ subsets: ["latin"], variable: "--ff-inter", weight: ["300", "400", "600", "700"] });

export const metadata: Metadata = {
  title: "Scout — AI Company Research",
  description:
    "Enter a company name or URL. Scout crawls, searches, and reasons over public data to produce an intelligence dossier and downloadable PDF.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={inter.variable}>
      <body>{children}</body>
    </html>
  );
}
