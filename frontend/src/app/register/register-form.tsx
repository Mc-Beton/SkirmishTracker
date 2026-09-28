"use client";

import Link from "next/link";
import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { OAuthButtons } from "@/components/auth/oauth-buttons";
import { useErrorMessage } from "@/components/auth/use-error-message";
import { api } from "@/lib/api";

export function RegisterForm() {
  const t = useTranslations("auth");
  const locale = useLocale();
  const errorMessage = useErrorMessage();
  const [form, setForm] = useState({ email: "", displayName: "", password: "" });
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("POST", "/api/auth/register", { ...form, locale });
      setDone(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (done) return <Alert variant="success">{t("registered")}</Alert>;

  return (
    <div className="grid gap-6">
      <form method="post" onSubmit={onSubmit} className="grid gap-4" noValidate>
        {error && <Alert variant="destructive">{error}</Alert>}
        <div className="grid gap-2">
          <Label htmlFor="email">{t("email")}</Label>
          <Input id="email" type="email" autoComplete="email" required maxLength={320}
            value={form.email} onChange={set("email")} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="displayName">{t("displayName")}</Label>
          <Input id="displayName" autoComplete="nickname" required minLength={3} maxLength={32}
            value={form.displayName} onChange={set("displayName")} aria-describedby="displayName-hint" />
          <p id="displayName-hint" className="text-xs text-muted-foreground">{t("displayNameHint")}</p>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="password">{t("password")}</Label>
          <Input id="password" type="password" autoComplete="new-password" required minLength={12} maxLength={128}
            value={form.password} onChange={set("password")} aria-describedby="password-hint" />
          <p id="password-hint" className="text-xs text-muted-foreground">{t("passwordHint")}</p>
        </div>
        <Button type="submit" disabled={busy}>{t("registerSubmit")}</Button>
      </form>
      <OAuthButtons />
      <p className="text-center text-sm text-muted-foreground">
        {t("haveAccount")}{" "}
        <Link href="/login" className="text-primary hover:underline">{t("loginSubmit")}</Link>
      </p>
    </div>
  );
}
