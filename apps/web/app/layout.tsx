import type { Metadata, Viewport } from "next";
import { Figtree, Prata } from "next/font/google";
import { brand } from "@/config/brand";
import "./globals.css";

const figtree = Figtree({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-figtree", display: "swap" });
const prata = Prata({ subsets: ["latin"], weight: "400", variable: "--font-prata", display: "swap" });

export const metadata: Metadata = {
  title: { default: brand.name, template: `%s · ${brand.shortName}` },
  description: brand.tagline,
  robots: { index: false, follow: false },
  icons: { icon: "/icon.svg", apple: "/apple-touch-icon.png" },
  appleWebApp: { capable: true, title: brand.shortName, statusBarStyle: "default" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f8f5f0" },
    { media: "(prefers-color-scheme: dark)", color: "#141210" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-MX" className={`${figtree.variable} ${prata.variable}`}>
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
