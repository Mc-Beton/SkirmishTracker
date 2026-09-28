"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { OAuthButtons } from "@/components/auth/oauth-buttons";
import { useAuth } from "@/components/auth/auth-provider";
import { useErrorMessage } from "@/components/auth/use-error-message";
import { api, ApiError } from "@/lib/api";

export function LoginForm() {
  const t = useTranslations("auth");
  const tErr = useTranslations("errors");
  const errorMessage = useErrorMessage();
  const router = useRouter();
  const params = useSearchParams();
  const { reload } = useAuth();
  const oauthError = params.get("error");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(
    oauthError ? (tErr.has(oauthError) ? tErr(oauthError) : tErr("OAUTH_FAILED")) : null,
  );
  const [unverified, setUnverified] = useState(false);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      await api("POST", "/api/auth/login", { email, password });
      await reload();
      router.push("/account");
    } catch (err) {
      setUnverified(err instanceof ApiError && err.code === "EMAIL_NOT_VERIFIED");
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    await api("POST", "/api/auth/resend-verification", { email }).catch(() => undefined);
    setUnverified(false);
    setError(null);
    setInfo(t("resent"));
  }

  return (
    <div className="grid gap-6">
      <form method="post" onSubmit={onSubmit} className="grid gap-4" noValidate>
        {error && (
          <Alert variant="destructive">
            {error}
            {unverified && (
              <Button type="button" variant="link" className="h-auto p-0 pl-1" onClick={resend}>
                {t("resend")}
              </Button>
            )}
          </Alert>
        )}
        {info && <Alert variant="success">{info}</Alert>}
        <div className="grid gap-2">
          <Label htmlFor="email">{t("email")}</Label>
          <Input id="email" type="email" autoComplete="email" required value={email}
            onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="grid gap-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">{t("password")}</Label>
            <Link href="/forgot-password" className="text-xs text-primary hover:underline">
              {t("forgot")}
            </Link>
          </div>
          <Input id="password" type="password" autoComplete="current-password" required value={password}
            onChange={(e) => setPassword(e.target.value)} />
        </div>
        <Button type="submit" disabled={busy}>{t("loginSubmit")}</Button>
      </form>
      <OAuthButtons />
      <p className="text-center text-sm text-muted-foreground">
        {t("noAccount")}{" "}
        <Link href="/register" className="text-primary hover:underline">{t("registerSubmit")}</Link>
      </p>
    </div>
  );
}
