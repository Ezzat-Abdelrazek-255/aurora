import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { Suspense } from "react";
import { ModalProvider } from "./components/ModalProvider";
import { SITE } from "./lib/site";
import "./globals.css";
import "lenis/dist/lenis.css";

const roslindaleDisplay = localFont({
  src: "./fonts/RoslindaleVariable-Display.ttf",
  variable: "--font-roslindale-display",
  weight: "200 900",
  display: "swap",
});

const roslindaleText = localFont({
  src: "./fonts/RoslindaleVariable-Text.ttf",
  variable: "--font-roslindale-text",
  weight: "200 900",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: {
    default: SITE.title,
    template: `%s — ${SITE.name}`,
  },
  description: SITE.description,
  applicationName: SITE.name,
  authors: [{ name: SITE.name }],
  creator: SITE.name,
  publisher: SITE.name,
  category: "arts",
  keywords: [
    "Aurora Leonard",
    "filmmaker",
    "film producer",
    "commercial director",
    "Reforest Films",
    "cinematic storytelling",
    "purpose-led films",
    "documentary",
    "brand films",
  ],
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    url: SITE.url,
    siteName: SITE.name,
    title: SITE.title,
    description: SITE.description,
    locale: SITE.locale,
  },
  twitter: {
    card: "summary_large_image",
    title: SITE.title,
    description: SITE.description,
    creator: SITE.twitter,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#ffffff",
  colorScheme: "light",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${roslindaleDisplay.variable} ${roslindaleText.variable} h-full antialiased`}
    >
      <head>
        <link rel="preconnect" href="https://player.vimeo.com" />
        <link rel="preconnect" href="https://i.vimeocdn.com" />
        <link rel="preconnect" href="https://f.vimeocdn.com" />
        <link rel="dns-prefetch" href="https://vod-progressive.akamaized.net" />
      </head>
      <body className="min-h-full">
        <ModalProvider>
          {/* Suspense boundary lets pages with uncached data (auth checks,
              searchParams) render dynamically while the static layout shell
              prerenders. Required by cacheComponents. */}
          <Suspense fallback={null}>{children}</Suspense>
        </ModalProvider>
        <div className="grain" aria-hidden="true" />
      </body>
    </html>
  );
}
