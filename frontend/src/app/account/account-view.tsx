"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PushSettings } from "@/components/pwa/push-settings";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/components/auth/auth-provider";
import { useErrorMessage } from "@/components/auth/use-error-message";
import { setLocale } from "@/i18n/actions";
import { api, type Me } from "@/lib/api";

export function AccountView() {
  const { me, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !me) router.replace("/login");
  }, [loading, me, router]);

  // Keyed by user so the form state re-initialises if a different account signs in.
  return me ? <AccountForms key={me.id} me={me} /> : null;
}

function AccountForms({ me }: { me: Me }) {
  const t = useTranslations("account");
  const tAuth = useTranslations("auth");
  const format = useFormatter();
  const errorMessage = useErrorMessage();
  const router = useRouter();
  const { reload } = useAuth();

  const [displayName, setDisplayName] = useState(me.displayName);
  const [locale, setLocaleValue] = useState<"pl" | "en">(me.locale);
  const [club, setClub] = useState(me.club ?? "");
  const [homeCity, setHomeCity] = useState(me.homeCity ?? "");
  const [confirmResults, setConfirmResults] = useState(me.confirmResults);
  const [profileMsg, setProfileMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [passwordMsg, setPasswordMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setProfileMsg(null);
    try {
      await api<Me>("PATCH", "/api/me", { displayName, locale, club, homeCity, confirmResults });
      await setLocale(locale);
      await reload();
      router.refresh();
      setProfileMsg({ ok: true, text: t("saved") });
    } catch (err) {
      setProfileMsg({ ok: false, text: errorMessage(err) });
    }
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    setPasswordMsg(null);
    try {
      await api("POST", "/api/me/password", { currentPassword, newPassword });
      setPasswordMsg({ ok: true, text: t("passwordChanged") });
      setTimeout(() => {
        void reload();
      }, 1500);
    } catch (err) {
      setPasswordMsg({ ok: false, text: errorMessage(err) });
    }
  }

  async function logoutAll() {
    await api("POST", "/api/auth/logout-all").catch(() => undefined);
    await reload();
    router.push("/login");
  }

  return (
    <div className="mx-auto grid w-full max-w-2xl gap-6 px-4 py-10">
      <h1 className="font-display text-3xl">{t("title")}</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">{t("profile")}</CardTitle>
          <CardDescription>
            {me.email} · {t("memberSince")} {format.dateTime(new Date(me.createdAt), { dateStyle: "medium" })}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form method="post" onSubmit={saveProfile} className="grid gap-4">
            {profileMsg && <Alert variant={profileMsg.ok ? "success" : "destructive"}>{profileMsg.text}</Alert>}
            <div className="grid gap-2">
              <Label htmlFor="displayName">{tAuth("displayName")}</Label>
              <Input id="displayName" minLength={3} maxLength={32} value={displayName}
                onChange={(e) => setDisplayName(e.target.value)} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid content-start gap-2">
                <Label htmlFor="club">{t("club")}</Label>
                <Input id="club" maxLength={80} value={club} onChange={(e) => setClub(e.target.value)} />
                <p className="text-xs text-muted-foreground">{t("clubHint")}</p>
              </div>
              <div className="grid content-start gap-2">
                <Label htmlFor="homeCity">{t("homeCity")}</Label>
                <Input id="homeCity" maxLength={80} value={homeCity} onChange={(e) => setHomeCity(e.target.value)} />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="locale">{t("language")}</Label>
              <select id="locale" value={locale} onChange={(e) => setLocaleValue(e.target.value as "pl" | "en")}
                className="h-9 rounded-md border border-input bg-card px-3 text-sm">
                <option value="pl">Polski</option>
                <option value="en">English</option>
              </select>
            </div>
            <fieldset className="grid gap-2">
              <legend className="mb-1 text-sm font-medium">{t("confirmResults.title")}</legend>
              {([false, true] as const).map((value) => (
                <label key={String(value)} className="flex items-start gap-3 text-sm">
                  <input type="radio" name="confirmResults" className="mt-0.5 size-4 accent-[var(--primary)]"
                    checked={confirmResults === value} onChange={() => setConfirmResults(value)} />
                  <span className="grid gap-0.5">
                    <span>{t(value ? "confirmResults.yes" : "confirmResults.no")}</span>
                    <span className="text-xs text-muted-foreground">
                      {t(value ? "confirmResults.yesHint" : "confirmResults.noHint")}
                    </span>
                  </span>
                </label>
              ))}
            </fieldset>
            <Button type="submit" className="justify-self-start">{t("save")}</Button>
          </form>
        </CardContent>
      </Card>

      <PushSettings />

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">{t("security")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-6">
          <form method="post" onSubmit={changePassword} className="grid gap-4">
            {passwordMsg && <Alert variant={passwordMsg.ok ? "success" : "destructive"}>{passwordMsg.text}</Alert>}
            {me.hasPassword && (
              <div className="grid gap-2">
                <Label htmlFor="currentPassword">{tAuth("currentPassword")}</Label>
                <Input id="currentPassword" type="password" autoComplete="current-password"
                  value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
              </div>
            )}
            <div className="grid gap-2">
              <Label htmlFor="newPassword">{tAuth("newPassword")}</Label>
              <Input id="newPassword" type="password" autoComplete="new-password" minLength={12} maxLength={128}
                value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
              <p className="text-xs text-muted-foreground">{tAuth("passwordHint")}</p>
            </div>
            <Button type="submit" variant="secondary" className="justify-self-start">
              {me.hasPassword ? t("changePassword") : t("setPassword")}
            </Button>
          </form>
          <div className="border-t pt-4">
            <Button variant="outline" onClick={logoutAll}>{t("logoutAll")}</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
