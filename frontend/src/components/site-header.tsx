"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Menu, UserRound, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LanguageSwitcher } from "@/components/language-switcher";
import { useAuth } from "@/components/auth/auth-provider";
import { NotificationBell } from "@/components/notifications/notification-bell";

export function SiteHeader() {
  const t = useTranslations();
  const { me, loading, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [openedAt, setOpenedAt] = useState(pathname);
  // Close the mobile menu after navigating (derived during render, no effect needed).
  if (open && openedAt !== pathname) {
    setOpen(false);
  }
  const links = [
    { href: "/tournaments", label: t("nav.tournaments") },
    { href: "/leagues", label: t("nav.leagues") },
    { href: "/players", label: t("nav.ranking") },
    { href: "/scenarios", label: t("nav.scenarios") },
    ...(me ? [{ href: "/games", label: t("nav.games") }] : []),
  ];

  return (
    <header className="sticky top-0 z-40 border-b-2 border-primary/70 bg-[#070b18]/90 shadow-[0_2px_12px_-4px_rgba(51,211,224,0.45)] backdrop-blur">
      <div className="mx-auto flex h-14 max-w-5xl items-center gap-1 px-3 sm:gap-3 sm:px-4">
        <Link href="/" className="flex items-center gap-2 font-display text-lg tracking-wide">
          {/* eslint-disable-next-line @next/next/no-img-element -- tiny static logo, no optimisation needed */}
          <img src="/logo.png" alt="" width={32} height={32} className="size-8" />
          <span className="hidden sm:inline">{t("app.name")}</span>
        </Link>
        <nav className="ml-2 hidden md:flex" aria-label={t("nav.main")}>
          {links.map((l) => (
            <Button key={l.href} variant="ghost" size="sm" asChild
              className={pathname.startsWith(l.href) ? "bg-accent" : undefined}>
              <Link href={l.href}>{l.label}</Link>
            </Button>
          ))}
        </nav>
        <Button variant="ghost" size="icon" className="md:hidden" aria-expanded={open} aria-controls="mobile-nav"
          aria-label={t("nav.menu")} onClick={() => { setOpenedAt(pathname); setOpen((o) => !o); }}>
          {open ? <X aria-hidden /> : <Menu aria-hidden />}
        </Button>
        <div className="ml-auto flex items-center gap-1 sm:gap-2">
          <LanguageSwitcher />
          {!loading &&
            (me ? (
              <>
                <NotificationBell key={me.id} />
                <Button variant="ghost" size="sm" asChild className="hidden sm:inline-flex">
                  <Link href={`/players/${me.id}`}>{me.displayName}</Link>
                </Button>
                <Button variant="ghost" size="icon" asChild className="sm:hidden">
                  <Link href="/account" aria-label={t("nav.account")}><UserRound aria-hidden /></Link>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    await logout();
                    router.push("/");
                  }}
                >
                  {t("nav.logout")}
                </Button>
              </>
            ) : (
              <>
                <Button variant="ghost" size="sm" asChild>
                  <Link href="/login">{t("nav.login")}</Link>
                </Button>
                <Button size="sm" asChild>
                  <Link href="/register">{t("nav.register")}</Link>
                </Button>
              </>
            ))}
        </div>
      </div>
      {open && (
        <nav id="mobile-nav" className="border-t md:hidden" aria-label={t("nav.main")}>
          <ul className="mx-auto grid max-w-5xl px-3 py-2">
            {links.map((l) => (
              <li key={l.href}>
                <Link href={l.href} className="block rounded-md px-3 py-2 text-sm hover:bg-accent">{l.label}</Link>
              </li>
            ))}
            {me && (
              <li>
                <Link href={`/players/${me.id}`} className="block rounded-md px-3 py-2 text-sm hover:bg-accent">
                  {t("nav.profile")}
                </Link>
              </li>
            )}
          </ul>
        </nav>
      )}
    </header>
  );
}
