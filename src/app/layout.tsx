import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { cookies, headers } from "next/headers";
import "./globals.css";
import { resolveLocale } from "@/i18n/resolve";
import { LOCALE_COOKIE } from "@/i18n/config";
import { LocaleProvider } from "@/app/_components/locale-provider";
import { LanguageSwitcher } from "@/app/_components/language-switcher";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Route Memory Trainer",
  description: "Learn and review bus routes.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const [cookieStore, headerStore] = await Promise.all([cookies(), headers()]);
  const locale = resolveLocale(
    headerStore.get("accept-language"),
    cookieStore.get(LOCALE_COOKIE)?.value ?? null
  );

  return (
    <html
      lang={locale}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <LocaleProvider locale={locale}>
          <div className="mx-auto flex w-full max-w-2xl justify-end px-4 pt-3">
            <LanguageSwitcher />
          </div>
          {children}
        </LocaleProvider>
      </body>
    </html>
  );
}
