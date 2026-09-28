"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useFormatter, useNow, useTranslations } from "next-intl";
import { Bell, CheckCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

type Notification = {
  id: string;
  type: string;
  params: Record<string, string | number | boolean>;
  link: string | null;
  createdAt: string;
  read: boolean;
};
type Inbox = { items: Notification[]; unread: number };

const POLL_MS = 30_000;

/** In-app notifications: unread badge, dropdown list; polls every 30 s and when the tab gets focus. */
export function NotificationBell() {
  const t = useTranslations("notifications");
  const format = useFormatter();
  const now = useNow({ updateInterval: 60_000 });
  const [inbox, setInbox] = useState<Inbox | null>(null);
  const [open, setOpen] = useState(false);
  const panel = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    try {
      setInbox(await api<Inbox>("GET", "/api/notifications"));
    } catch {
      // Offline or signed out: keep what we have.
    }
  }, []);

  useEffect(() => {
    let active = true;
    const tick = () => {
      if (active && document.visibilityState === "visible") void refresh();
    };
    tick();
    const id = setInterval(tick, POLL_MS);
    window.addEventListener("focus", tick);
    return () => {
      active = false;
      clearInterval(id);
      window.removeEventListener("focus", tick);
    };
  }, [refresh]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !panel.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  async function markRead(n: Notification) {
    if (n.read) return;
    setInbox((i) => i && {
      items: i.items.map((x) => (x.id === n.id ? { ...x, read: true } : x)),
      unread: Math.max(0, i.unread - 1),
    });
    await api("POST", `/api/notifications/${n.id}/read`).catch(() => undefined);
  }

  async function markAll() {
    setInbox((i) => i && { items: i.items.map((x) => ({ ...x, read: true })), unread: 0 });
    await api("POST", "/api/notifications/read-all").catch(() => undefined);
  }

  const unread = inbox?.unread ?? 0;
  const text = (n: Notification) => {
    try {
      return t(`types.${n.type}`, n.params as Record<string, string | number>);
    } catch {
      return n.type;
    }
  };

  return (
    <div ref={panel} className="relative">
      <Button variant="ghost" size="icon" aria-expanded={open} aria-haspopup="dialog"
        aria-label={unread > 0 ? t("labelUnread", { n: unread }) : t("label")}
        onClick={() => {
          setOpen((o) => !o);
          if (!open) void refresh();
        }}>
        <Bell aria-hidden />
        {unread > 0 && (
          <span className="absolute right-1 top-1 grid min-w-4 place-items-center rounded-full bg-destructive px-1 text-[10px] font-semibold leading-4 text-background">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </Button>
      {open && (
        <div role="dialog" aria-label={t("title")}
          className="absolute right-0 z-50 mt-2 w-[min(22rem,calc(100vw-1.5rem))] overflow-hidden rounded-lg border bg-card shadow-lg">
          <div className="flex items-center justify-between border-b px-3 py-2">
            <h2 className="text-sm font-medium">{t("title")}</h2>
            {unread > 0 && (
              <Button variant="ghost" size="sm" onClick={markAll}>
                <CheckCheck aria-hidden /> {t("readAll")}
              </Button>
            )}
          </div>
          {!inbox || inbox.items.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">{t("empty")}</p>
          ) : (
            <ul className="max-h-[60vh] divide-y overflow-y-auto">
              {inbox.items.map((n) => {
                const body = (
                  <>
                    <span className={cn("text-sm", !n.read && "font-medium")}>{text(n)}</span>
                    <span className="text-xs text-muted-foreground">
                      {format.relativeTime(new Date(n.createdAt), now)}
                    </span>
                  </>
                );
                const cls = cn("grid gap-0.5 px-3 py-2 text-left hover:bg-accent", !n.read && "bg-accent/40");
                return (
                  <li key={n.id} className="relative">
                    {!n.read && <span className="absolute left-1 top-3 size-1.5 rounded-full bg-primary" aria-hidden />}
                    {n.link && n.link.startsWith("/") && !n.link.startsWith("//") ? (
                      <Link href={n.link} className={cn(cls, "block")} onClick={() => { void markRead(n); setOpen(false); }}>
                        <span className="grid gap-0.5">{body}</span>
                      </Link>
                    ) : (
                      <button type="button" className={cn(cls, "w-full")} onClick={() => markRead(n)}>{body}</button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
