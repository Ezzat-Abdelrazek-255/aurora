import type { Metadata } from "next";
import localFont from "next/font/local";
import { ModalProvider } from "./components/ModalProvider";
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
  title: "Aurora Leonard — Director",
  description: "Selected work",
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
        <ModalProvider>{children}</ModalProvider>
        <div className="grain" aria-hidden="true" />
      </body>
    </html>
  );
}
