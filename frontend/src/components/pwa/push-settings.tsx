"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { BellRing } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useErrorMessage } from "@/components/auth/use-error-message";
import { disablePush, enablePush, pushState, testPush, type PushState } from "@/lib/push";

/** Account page: turn push notifications on / off for this device and send a test. */
export function PushSettings() {
  const t = useTranslations("push");
  const errorMessage = useErrorMessage();
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    pushState().then((s) => active && setState(s)).catch(() => active && setState("unsupported"));
    return () => {
      active = false;
    };
  }, []);

  const run = async (action: () => Promise<PushState | void>, done?: string) => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const next = await action();
      setState(next ?? (await pushState()));
      if (done) setMessage(done);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xl"><BellRing className="size-5" aria-hidden />{t("title")}</CardTitle>
        <CardDescription>{t("lead")}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        {state && <p className="text-sm">{t(`state.${state}`)}</p>}
        {state === "unsupported" && <p className="text-xs text-muted-foreground">{t("iosHint")}</p>}
        <div className="flex flex-wrap gap-2">
          {state === "off" && <Button disabled={busy} onClick={() => run(enablePush)}>{t("enable")}</Button>}
          {state === "on" && (
            <>
              <Button variant="outline" disabled={busy} onClick={() => run(async () => { await testPush(); return "on"; }, t("testSent"))}>
                {t("test")}
              </Button>
              <Button variant="outline" disabled={busy} onClick={() => run(async () => { await disablePush(); return "off"; })}>
                {t("disable")}
              </Button>
            </>
          )}
        </div>
        {message && <p className="text-sm text-muted-foreground">{message}</p>}
        {error && <Alert variant="destructive">{error}</Alert>}
      </CardContent>
    </Card>
  );
}
