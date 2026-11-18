import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "ogchat",
  description: "A personal, local-only AI chat interface.",
  robots: { index: false, follow: false },
  // For running ogchat as an app of its own (see README: "As an app of its own").
  icons: { apple: "/icon-192.png" },
  appleWebApp: { capable: true, title: "ogchat", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  themeColor: "#0d0c0b",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
