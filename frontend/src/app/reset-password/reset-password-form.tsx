"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useErrorMessage } from "@/components/auth/use-error-message";
import { api } from "@/lib/api";

export function ResetPasswordForm() {
  const t = useTranslations("auth");
  const errorMessage = useErrorMessage();
  const token = useSearchParams().get("token");
  const [password, setPassword] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!token) return <Alert variant="destructive">{t("missingToken")}</Alert>;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("POST", "/api/auth/reset-password", { token, newPassword: password });
      setDone(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (done)
    return (
      <div className="grid gap-4">
        <Alert variant="success">{t("resetDone")}</Alert>
        <Button asChild>
          <Link href="/login">{t("loginSubmit")}</Link>
        </Button>
      </div>
    );

  return (
    <form method="post" onSubmit={onSubmit} className="grid gap-4" noValidate>
      {error && <Alert variant="destructive">{error}</Alert>}
      <div className="grid gap-2">
        <Label htmlFor="password">{t("newPassword")}</Label>
        <Input id="password" type="password" autoComplete="new-password" required minLength={12} maxLength={128}
          value={password} onChange={(e) => setPassword(e.target.value)} aria-describedby="password-hint" />
        <p id="password-hint" className="text-xs text-muted-foreground">{t("passwordHint")}</p>
      </div>
      <Button type="submit" disabled={busy}>{t("resetSubmit")}</Button>
    </form>
  );
}
