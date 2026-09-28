"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useErrorMessage } from "@/components/auth/use-error-message";
import { api } from "@/lib/api";

export function ForgotPasswordForm() {
  const t = useTranslations("auth");
  const errorMessage = useErrorMessage();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("POST", "/api/auth/forgot-password", { email });
      setSent(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (sent) return <Alert variant="success">{t("forgotSent")}</Alert>;

  return (
    <form method="post" onSubmit={onSubmit} className="grid gap-4" noValidate>
      {error && <Alert variant="destructive">{error}</Alert>}
      <div className="grid gap-2">
        <Label htmlFor="email">{t("email")}</Label>
        <Input id="email" type="email" autoComplete="email" required value={email}
          onChange={(e) => setEmail(e.target.value)} />
      </div>
      <Button type="submit" disabled={busy}>{t("forgotSubmit")}</Button>
    </form>
  );
}
