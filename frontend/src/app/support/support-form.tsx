"use client";

import Link from "next/link";
import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/components/auth/auth-provider";
import { useErrorMessage } from "@/components/auth/use-error-message";
import { api } from "@/lib/api";

const TOPICS = ["QUESTION", "BUG", "IDEA", "OTHER"] as const;

export function SupportForm() {
  const t = useTranslations("support");
  const tf = useTranslations("footer");
  const locale = useLocale();
  const errorMessage = useErrorMessage();
  const { me } = useAuth();
  // Signed-in users start with their account e-mail (they can still change it).
  const [email, setEmail] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [topic, setTopic] = useState<(typeof TOPICS)[number]>("QUESTION");
  const [message, setMessage] = useState("");
  const [website, setWebsite] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const emailValue = email ?? me?.email ?? "";

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("POST", "/api/support", {
        email: emailValue, name: name || null, topic, message, locale, website: website || null,
      });
      setSent(true);
      setMessage("");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <div className="grid gap-4">
        <Alert variant="success">{t("sent")}</Alert>
        <Button variant="outline" className="justify-self-start" onClick={() => setSent(false)}>{t("another")}</Button>
      </div>
    );
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <form method="post" onSubmit={onSubmit} className="grid gap-4">
          {error && <Alert variant="destructive">{error}</Alert>}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="support-email">{t("email")}</Label>
              <Input id="support-email" type="email" autoComplete="email" required maxLength={320}
                value={emailValue} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="support-name">{t("name")}</Label>
              <Input id="support-name" autoComplete="nickname" maxLength={80}
                value={name} onChange={(e) => setName(e.target.value)} />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="support-topic">{t("topic")}</Label>
            <NativeSelect id="support-topic" value={topic}
              onChange={(e) => setTopic(e.target.value as (typeof TOPICS)[number])}>
              {TOPICS.map((x) => <option key={x} value={x}>{t(`topics.${x}`)}</option>)}
            </NativeSelect>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="support-message">{t("message")}</Label>
            <Textarea id="support-message" required minLength={10} maxLength={5000} rows={7}
              value={message} onChange={(e) => setMessage(e.target.value)} />
            <p className="text-xs text-muted-foreground">{t("messageHint")}</p>
          </div>
          {/* Honeypot for bots: hidden from people and screen readers. */}
          <div aria-hidden className="absolute -left-[9999px] h-px w-px overflow-hidden">
            <label htmlFor="support-website">Website</label>
            <input id="support-website" tabIndex={-1} autoComplete="off" value={website}
              onChange={(e) => setWebsite(e.target.value)} />
          </div>
          <p className="text-xs text-muted-foreground">
            {t("privacy")} <Link href="/terms" className="text-primary underline">{tf("terms")}</Link>
          </p>
          <Button type="submit" disabled={busy} className="justify-self-start">{busy ? t("sending") : t("send")}</Button>
        </form>
      </CardContent>
    </Card>
  );
}
