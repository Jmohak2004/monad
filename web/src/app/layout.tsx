import type { Metadata, Viewport } from "next";
import { Geist_Mono, Roboto_Flex } from "next/font/google";
import { AccountProvider } from "@/components/AccountProvider";
import "./globals.css";

const sans = Roboto_Flex({
  subsets: ["latin"],
  display: "swap",
  axes: ["wdth"],
  variable: "--font-roboto",
});
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Ghar: send money home",
  description: "Send dollars to family abroad with a link. No app, no seed phrase, no fees for them.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Ghar", statusBarStyle: "default" },
  icons: { icon: "/icon.svg", apple: "/icon.svg" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#1436c8" },
    { media: "(prefers-color-scheme: dark)", color: "#0c1f78" },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${sans.variable} ${geistMono.variable} antialiased`}>
        <AccountProvider>
          <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-4 px-4 pb-10 pt-[max(1rem,env(safe-area-inset-top))]">
            {children}
          </main>
        </AccountProvider>
      </body>
    </html>
  );
}
