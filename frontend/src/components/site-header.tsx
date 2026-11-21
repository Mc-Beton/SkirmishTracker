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
import { reportRoles } from "@/lib/reports";
import { GameSystemSwitcher } from "@/components/game-system-switcher";
import { useGameSystem } from "@/components/game-system-provider";

export function SiteHeader() {
  const t = useTranslations();
  const { me, loading, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [openedAt, setOpenedAt] = useState(pathname);
  const { system } = useGameSystem();
  const eldfall = system === "ELDFALL";
  // Close the mobile menu after navigating (derived during render, no effect needed).
  if (open && openedAt !== pathname) {
    setOpen(false);
  }
  const links = [
    { href: "/tournaments", label: t("nav.tournaments") },
    { href: "/leagues", label: t("nav.leagues") },
    { href: "/players", label: t("nav.ranking") },
    ...(me ? [{ href: "/teams", label: t("nav.teams") }] : []),
    // Information modules, own games, online play and the official program are Eldfall-only.
    ...(eldfall ? [{ href: "/seasons", label: t("nav.seasons") }, { href: "/scenarios", label: t("nav.scenarios") }] : []),
    ...(me && eldfall ? [{ href: "/games", label: t("nav.games") }, { href: "/lists", label: t("nav.lists") },
      { href: "/tables", label: t("nav.tables") }] : []),
    ...(eldfall && me?.roles.includes("ADMIN") ? [{ href: "/admin/table", label: t("nav.tableLibrary") }, { href: "/admin/maps3d", label: t("nav.maps3d") }] : []),
    ...(eldfall && reportRoles(me?.roles) ? [{ href: "/admin/reports", label: t("nav.reports") }] : []),
  ];

  return (
    <header className="sticky top-0 z-40 border-b-2 border-primary/70 bg-[var(--chrome)] shadow-[0_2px_12px_-4px_var(--chrome-glow)] backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-1 px-3 sm:gap-3 sm:px-4">
        {/* Phones: logo with the game-system picker stacked under it (keeps the row narrow, so nothing
            overlaps the menu button); from sm up: logo, then the name with the picker under it. */}
        <div className="flex shrink-0 flex-col items-start sm:flex-row sm:items-center sm:gap-2">
          <Link href="/" aria-label={t("app.name")} className="shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element -- tiny static logo, no optimisation needed */}
            <img src="/logo.png?v=2" alt="" width={32} height={32} className="size-7 sm:size-8" />
          </Link>
          <div className="grid leading-none">
            <Link href="/" className="hidden font-display text-lg leading-6 tracking-wide sm:inline">{t("app.name")}</Link>
            <GameSystemSwitcher />
          </div>
        </div>
        <nav className="ml-2 hidden xl:flex" aria-label={t("nav.main")}>
          {links.map((l) => (
            <Button key={l.href} variant="ghost" size="sm" asChild
              className={pathname.startsWith(l.href) ? "bg-accent" : undefined}>
              <Link href={l.href}>{l.label}</Link>
            </Button>
          ))}
        </nav>
        <Button variant="ghost" size="icon" className="xl:hidden" aria-expanded={open} aria-controls="mobile-nav"
          aria-label={t("nav.menu")} onClick={() => { setOpenedAt(pathname); setOpen((o) => !o); }}>
          {open ? <X aria-hidden /> : <Menu aria-hidden />}
        </Button>
        <div className="ml-auto flex min-w-0 items-center gap-1 sm:gap-2">
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
        <nav id="mobile-nav" className="border-t xl:hidden" aria-label={t("nav.main")}>
          <ul className="mx-auto grid max-w-6xl px-3 py-2">
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
