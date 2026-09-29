"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/components/auth/auth-provider";
import { useErrorMessage } from "@/components/auth/use-error-message";
import { RankBadge, StatusBadge } from "@/components/tournaments/status-badge";
import { api } from "@/lib/api";
import { reportRoles } from "@/lib/reports";
import { DEFAULT_SEASON, type OfficialCandidate, type SeasonSettings, type SeasonSummary, type SeasonView } from "@/lib/seasons";

export function ManageSeasons() {
  const t = useTranslations("seasons.admin");
  const format = useFormatter();
  const errorMessage = useErrorMessage();
  const { me, loading } = useAuth();
  const allowed = reportRoles(me?.roles);
  const [seasons, setSeasons] = useState<SeasonSummary[]>([]);
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [form, setForm] = useState<SeasonSettings>(DEFAULT_SEASON);
  const [range, setRange] = useState({ from: `${new Date().getFullYear()}-01-01`, to: `${new Date().getFullYear()}-12-31` });
  const [candidates, setCandidates] = useState<OfficialCandidate[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const loadSeasons = useCallback(() => api<SeasonSummary[]>("GET", "/api/seasons"), []);
  const loadCandidates = useCallback(
    (from: string, to: string) => api<OfficialCandidate[]>("GET", `/api/admin/official/tournaments?from=${from}&to=${to}`), []);

  useEffect(() => {
    if (!allowed) return;
    let active = true;
    loadSeasons().then((s) => active && setSeasons(s)).catch((err) => active && setError(errorMessage(err)));
    return () => {
      active = false;
    };
  }, [allowed, loadSeasons, errorMessage]);

  useEffect(() => {
    if (!allowed || !range.from || !range.to || range.to < range.from) return;
    let active = true;
    loadCandidates(range.from, range.to).then((c) => active && setCandidates(c)).catch((err) => active && setError(errorMessage(err)));
    return () => {
      active = false;
    };
  }, [allowed, range, loadCandidates, errorMessage]);

  if (loading) return null;
  if (!allowed) {
    return <div className="mx-auto w-full max-w-5xl px-4 py-10"><Alert variant="destructive">{t("forbidden")}</Alert></div>;
  }

  const edit = async (s: SeasonSummary | null) => {
    setError(null);
    if (!s) {
      setForm({ ...DEFAULT_SEASON, startsOn: range.from, endsOn: range.to });
      setEditing("new");
      return;
    }
    try {
      const v = await api<SeasonView>("GET", `/api/seasons/${s.id}`);
      setForm(v.settings);
      setEditing(s.id);
      setRange({ from: v.settings.startsOn, to: v.settings.endsOn });
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (editing === "new") await api("POST", "/api/admin/seasons", form);
      else if (editing) await api("PUT", `/api/admin/seasons/${editing}`, form);
      setEditing(null);
      setSeasons(await loadSeasons());
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!editing || editing === "new" || !window.confirm(t("confirmDelete"))) return;
    try {
      await api("DELETE", `/api/admin/seasons/${editing}`);
      setEditing(null);
      setSeasons(await loadSeasons());
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const toggle = async (c: OfficialCandidate) => {
    setError(null);
    setCandidates((list) => list?.map((x) => (x.id === c.id ? { ...x, official: !c.official } : x)) ?? null);
    try {
      await api("PUT", `/api/admin/official/tournaments/${c.id}`, { official: !c.official });
    } catch (err) {
      setError(errorMessage(err));
      setCandidates((list) => list?.map((x) => (x.id === c.id ? { ...x, official: c.official } : x)) ?? null);
    }
  };

  const num = (k: keyof SeasonSettings) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: Number(e.target.value) }));

  return (
    <div className="mx-auto grid w-full max-w-5xl gap-6 px-4 py-10 [&>*]:min-w-0">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="grid gap-1">
          <h1 className="font-display text-3xl">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("lead")}</p>
        </div>
        <Button variant="outline" size="sm" asChild><Link href="/seasons">{t("public")}</Link></Button>
      </div>
      {error && <Alert variant="destructive">{error}</Alert>}

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-xl">{t("seasons")}</CardTitle>
          <Button size="sm" onClick={() => edit(null)}>{t("add")}</Button>
        </CardHeader>
        <CardContent className="grid gap-4">
          {seasons.length === 0 && <p className="text-sm text-muted-foreground">{t("noSeasons")}</p>}
          <ul className="grid gap-2">
            {seasons.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3">
                <span><span className="font-medium">{s.name}</span>
                  <span className="block text-xs text-muted-foreground">{s.startsOn} – {s.endsOn}{s.current ? ` · ${t("current")}` : ""}</span>
                </span>
                <Button variant="outline" size="sm" onClick={() => edit(s)}>{t("edit")}</Button>
              </li>
            ))}
          </ul>
          {editing && (
            <form onSubmit={save} className="grid gap-3 rounded-lg border p-4 sm:grid-cols-2">
              <div className="grid gap-1.5 sm:col-span-2">
                <Label htmlFor="s-name">{t("name")}</Label>
                <Input id="s-name" required maxLength={80} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="s-from">{t("startsOn")}</Label>
                <Input id="s-from" type="date" required value={form.startsOn} onChange={(e) => setForm((f) => ({ ...f, startsOn: e.target.value }))} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="s-to">{t("endsOn")}</Label>
                <Input id="s-to" type="date" required min={form.startsOn} value={form.endsOn} onChange={(e) => setForm((f) => ({ ...f, endsOn: e.target.value }))} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="s-local">{t("pointsLocal")}</Label>
                <Input id="s-local" type="number" min={0} max={10000} value={form.pointsLocal} onChange={num("pointsLocal")} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="s-master">{t("pointsMaster")}</Label>
                <Input id="s-master" type="number" min={0} max={10000} value={form.pointsMaster} onChange={num("pointsMaster")} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="s-intl">{t("pointsInternational")}</Label>
                <Input id="s-intl" type="number" min={0} max={10000} value={form.pointsInternational} onChange={num("pointsInternational")} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="s-best">{t("bestResults")}</Label>
                <Input id="s-best" type="number" min={1} max={50} value={form.bestResults} onChange={num("bestResults")} />
              </div>
              <p className="text-xs text-muted-foreground sm:col-span-2">{t("formula")}</p>
              <div className="flex flex-wrap gap-2 sm:col-span-2">
                <Button type="submit" disabled={busy}>{t("save")}</Button>
                <Button type="button" variant="outline" onClick={() => setEditing(null)}>{t("cancel")}</Button>
                {editing !== "new" && <Button type="button" variant="destructive" className="ml-auto" onClick={remove}>{t("delete")}</Button>}
              </div>
            </form>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">{t("officialTitle")}</CardTitle>
          <p className="text-sm text-muted-foreground">{t("officialLead")}</p>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid max-w-md grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="r-from" className="text-xs">{t("from")}</Label>
              <Input id="r-from" type="date" value={range.from} onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="r-to" className="text-xs">{t("to")}</Label>
              <Input id="r-to" type="date" min={range.from} value={range.to} onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))} />
            </div>
          </div>
          {candidates && candidates.length === 0 && <p className="text-sm text-muted-foreground">{t("noTournaments")}</p>}
          <ul className="grid gap-2">
            {candidates?.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-3 rounded-lg border p-3">
                <input type="checkbox" id={`off-${c.id}`} checked={c.official} onChange={() => toggle(c)} className="size-4 accent-[var(--primary)]" />
                <label htmlFor={`off-${c.id}`} className="grid min-w-0 flex-1 gap-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <RankBadge rank={c.rank} /><StatusBadge status={c.status} />
                    <span className="font-medium">{c.name}</span>
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {format.dateTime(new Date(c.startsAt), { dateStyle: "medium" })} · {c.city}, {c.country} · {t("playersN", { n: c.players })} · {c.organizerName}
                    {c.team && ` · ${t("team")}`}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
