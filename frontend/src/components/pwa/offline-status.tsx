"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { CloudOff, RefreshCw, X } from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";
import {
  dismissFailure, failures, flush, onOutboxChange, pending, SYNCED_EVENT, type FailedItem,
} from "@/lib/offline-queue";

function subscribeOnline(cb: () => void) {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
}

/** Browser connectivity (true on the server, so nothing flashes during hydration). */
export function useOnline(): boolean {
  return useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);
}

/**
 * Offline banner and outbox runner: shows when the app works without a connection, how many changes wait on
 * this device, sends them when the network returns and lists changes the server refused.
 */
export function OfflineStatus() {
  const t = useTranslations("offline");
  const te = useTranslations("errors");
  const { me } = useAuth();
  const online = useOnline();
  const [waiting, setWaiting] = useState(0);
  const [failed, setFailed] = useState<FailedItem[]>([]);

  const refresh = useCallback(async () => {
    if (!me) {
      setWaiting(0);
      setFailed([]);
      return;
    }
    try {
      const [p, f] = await Promise.all([pending(me.id), failures(me.id)]);
      setWaiting(p.length);
      setFailed(f);
    } catch {
      // IndexedDB unavailable (private mode in some browsers): nothing is stored, nothing to show.
    }
  }, [me]);

  const sync = useCallback(async () => {
    if (!me || !navigator.onLine) return;
    try {
      const sent = await flush(me.id);
      if (sent > 0) window.dispatchEvent(new Event(SYNCED_EVENT));
    } catch {
      // Storage error: retried on the next trigger.
    }
  }, [me]);

  useEffect(() => {
    let active = true;
    const run = () => {
      if (!active) return;
      void refresh();
      void sync();
    };
    run();
    const off = onOutboxChange(run);
    const timer = setInterval(run, 20_000);
    window.addEventListener("online", run);
    document.addEventListener("visibilitychange", run);
    return () => {
      active = false;
      off();
      clearInterval(timer);
      window.removeEventListener("online", run);
      document.removeEventListener("visibilitychange", run);
    };
  }, [refresh, sync]);

  if (online && waiting === 0 && failed.length === 0) return null;

  const labelOf = (item: FailedItem) => t(`labels.${item.label}`, item.labelParams ?? {});
  return (
    <div role="status" aria-live="polite" className="border-b bg-card/95 text-sm">
      <div className="mx-auto grid w-full max-w-6xl gap-1 px-4 py-2">
        {!online && (
          <p className="flex items-start gap-2 text-amber-200">
            <CloudOff className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>{waiting > 0 ? t("offlineWaiting", { count: waiting }) : t("offline")}</span>
          </p>
        )}
        {online && waiting > 0 && (
          <p className="flex items-center gap-2 text-muted-foreground">
            <RefreshCw className="size-4 shrink-0 animate-spin" aria-hidden />
            {t("syncing", { count: waiting })}
          </p>
        )}
        {failed.map((f) => (
          <p key={f.key} className="flex items-start gap-2 text-destructive">
            <span className="min-w-0 flex-1">
              {t("rejected", { what: labelOf(f), reason: te.has(f.error) ? te(f.error) : te("INTERNAL_ERROR") })}
            </span>
            <button type="button" className="shrink-0 rounded p-0.5 hover:bg-accent" aria-label={t("dismiss")}
              onClick={() => void dismissFailure(f.key)}>
              <X className="size-4" aria-hidden />
            </button>
          </p>
        ))}
      </div>
    </div>
  );
}
