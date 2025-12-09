import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import ViewportHandler from "@/components/ViewportHandler";
import ResponsiveToaster from "@/components/ResponsiveToaster";

const inter = Inter({ subsets: ["latin"] });

import type { Viewport } from "next";

export const viewport: Viewport = {
  themeColor: "#000000",
};

export const metadata: Metadata = {
  title: "Emblematix",
  description: "A little tool to embed EXIF watermarks into images.",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Emblematix",
  },
  formatDetection: {
    telephone: false,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <ViewportHandler />
        {children}
        <ResponsiveToaster />
      </body>
    </html>
  );
}
