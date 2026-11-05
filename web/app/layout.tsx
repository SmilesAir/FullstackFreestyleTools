import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { LocaleProvider } from "@/lib/i18n/client";
import { INTL_LOCALE } from "@/lib/i18n/locales";
import { getLocale, getT } from "@/lib/i18n/server";
import { LanguageSwitch } from "./_components/LanguageSwitch";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t.common.siteName, description: t.common.siteDescription };
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const locale = await getLocale();
  return (
    <html
      lang={INTL_LOCALE[locale]}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <LocaleProvider locale={locale}>
          {children}
          <LanguageSwitch />
        </LocaleProvider>
      </body>
    </html>
  );
}
