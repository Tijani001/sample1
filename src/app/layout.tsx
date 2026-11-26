import type { Metadata, Viewport } from "next";
import "@fontsource-variable/plus-jakarta-sans";
import { GeistMono } from "geist/font/mono";
import { Toaster } from "sonner";
import { MotionProvider } from "@/components/motion-provider";
import { ServiceWorkerRegister } from "@/components/sw-register";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title: { default: "Goroada · Every road. One app.", template: "%s · Goroada" },
  description: "Search, compare and book road trips from trusted transport operators, all in one place.",
  applicationName: "Goroada",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [{ url: "/icons/favicon.svg", type: "image/svg+xml" }, { url: "/icons/favicon-64.png", sizes: "64x64", type: "image/png" }, { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
  appleWebApp: { capable: true, title: "Goroada", statusBarStyle: "default" },
  openGraph: { title: "Goroada", description: "Every road. One app.", type: "website", siteName: "Goroada", images: [{ url: "/brand/logo-1200.png", width: 1200, height: 269, alt: "Goroada" }] },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-NG" className={GeistMono.variable}>
      <body className="min-h-dvh">
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:shadow-lg">
          Skip to content
        </a>
        <MotionProvider>{children}</MotionProvider>
        <Toaster
          position="top-center"
          toastOptions={{
            classNames: {
              toast: "!rounded-xl !border-line !shadow-lg !font-sans !text-sm",
              title: "!font-semibold !text-ink",
              description: "!text-ink-3",
            },
          }}
        />
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
