import type { Metadata, Viewport } from "next";
import { Lato } from "next/font/google";
import { Providers } from "@/components/providers";
import { A11Y_BOOT_SCRIPT } from "@/components/shell/a11y-prefs";
import "./globals.css";

const lato = Lato({
  variable: "--font-lato",
  subsets: ["latin"],
  weight: ["400", "700", "900"],
});

export const metadata: Metadata = {
  title: { default: "NutriMove AI", template: "%s · NutriMove AI" },
  description:
    "Your intelligent fitness and nutrition coach: real-time form feedback, calorie tracking, and adaptive meal and workout plans.",
  applicationName: "NutriMove AI",
  appleWebApp: { capable: true, title: "NutriMove", statusBarStyle: "default" },
  icons: { apple: "/icons/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  themeColor: "#9bd141",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${lato.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: A11Y_BOOT_SCRIPT }} />
      </head>
      <body className="min-h-full">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-lg focus:bg-nm-ink focus:px-4 focus:py-2 focus:text-white"
        >
          Skip to content
        </a>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
