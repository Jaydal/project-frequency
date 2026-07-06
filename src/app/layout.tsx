import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "@/features/auth/components/providers";
import { Toaster } from "@/components/ui/sonner";
import { startExpiryProcessor } from "@/lib/queue/queue-processor";

if (typeof globalThis !== 'undefined' && typeof window === 'undefined') {
  if (!(globalThis as any)._queueProcessorStarted) {
    (globalThis as any)._queueProcessorStarted = true;
    startExpiryProcessor();
  }
}

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Pickleball Court Management",
  description: "Management Portal for Pickleball Courts",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <Providers>{children}</Providers>
        <Toaster />
      </body>
    </html>
  );
}
