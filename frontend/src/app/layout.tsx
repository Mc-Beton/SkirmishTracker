import type { Metadata, Viewport } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import { cookies } from "next/headers";
import { GameSystemProvider } from "@/components/game-system-provider";
import { DEFAULT_SYSTEM, isGameSystem, SYSTEM_COOKIE, themeColorOf, themeOf, type GameSystem } from "@/lib/game-system";
import { AuthProvider } from "@/components/auth/auth-provider";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { OfflineStatus } from "@/components/pwa/offline-status";
import { ServiceWorkerRegistration } from "@/components/pwa/service-worker";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("app");
  return {
    title: { default: t("name"), template: `%s · ${t("name")}` },
    description: t("tagline"),
    applicationName: t("name"),
    appleWebApp: { capable: true, title: t("name"), statusBarStyle: "black-translucent" },
  };
}

async function currentSystem(): Promise<GameSystem> {
  const value = (await cookies()).get(SYSTEM_COOKIE)?.value;
  return isGameSystem(value) ? value : DEFAULT_SYSTEM;
}

export async function generateViewport(): Promise<Viewport> {
  return { themeColor: themeColorOf(await currentSystem()), width: "device-width", initialScale: 1 };
}

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const locale = await getLocale();
  const system = await currentSystem();
  // Eldfall: dark night-sky theme; Bolt Action: light "modern wargame" theme (globals.css, data-system).
  return (
    <html lang={locale} className={system === "ELDFALL" ? "dark" : undefined} data-system={themeOf(system)}>
      <body className="flex min-h-dvh flex-col">
        <NextIntlClientProvider>
          <GameSystemProvider initial={system}>
          <AuthProvider>
            <SiteHeader />
            <OfflineStatus />
            <ServiceWorkerRegistration />
            <main className="flex flex-1 flex-col">{children}</main>
            <SiteFooter />
          </AuthProvider>
          </GameSystemProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
