"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Check, Copy, Crown, LogOut, Trash2, UserPlus, X } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/components/auth/auth-provider";
import { useErrorMessage } from "@/components/auth/use-error-message";
import { PlayerSearch } from "@/components/table/player-search";
import { api } from "@/lib/api";
import type { ClubListed, ClubView, MyClubs } from "@/lib/clubs";
import type { SearchHit } from "@/lib/players";

/** The player's team (or how to get one): found a team, join by a link, answer invitations, ask to join. */
export function TeamsView() {
  const t = useTranslations("teams");
  const errorMessage = useErrorMessage();
  const router = useRouter();
  const invite = useSearchParams().get("invite");
  const { me, loading } = useAuth();
  const [mine, setMine] = useState<MyClubs | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<ClubListed[]>([]);
  const [pick, setPick] = useState<SearchHit | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [rename, setRename] = useState<string | null>(null);

  const load = useCallback(async () => setMine(await api<MyClubs>("GET", "/api/clubs/mine")), []);

  /** Runs a change, then reads the state again; an error is shown above the page. */
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await load();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (loading) return;
    if (!me) return;
    let active = true;
    (async () => {
      try {
        // An invitation link: opening it while signed in joins the team.
        if (invite) await api<ClubView>("POST", "/api/clubs/join", { invite });
      } catch (e) {
        if (active) setError(errorMessage(e));
      }
      try {
        const m = await api<MyClubs>("GET", "/api/clubs/mine");
        if (active) setMine(m);
        if (invite) router.replace("/teams");
      } catch (e) {
        if (active) setError(errorMessage(e));
      }
    })();
    return () => {
      active = false;
    };
  }, [loading, me, invite, router, errorMessage]);

  // Teams to ask: the search runs as the player types.
  const hasTeam = !!mine?.club;
  useEffect(() => {
    if (!me || !mine || hasTeam) return;
    let active = true;
    const timer = setTimeout(() => {
      api<ClubListed[]>("GET", `/api/clubs?${new URLSearchParams({ q: query.trim() })}`)
        .then((l) => active && setFound(l))
        .catch(() => active && setFound([]));
    }, 250);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [me, mine, hasTeam, query]);

  if (!loading && !me) {
    return (
      <main className="mx-auto grid w-full max-w-3xl gap-4 p-4">
        <h1 className="font-display text-2xl">{t("title")}</h1>
        <Alert>{t(invite ? "loginToJoin" : "loginRequired")} <Link className="underline" href="/login">{t("login")}</Link></Alert>
      </main>
    );
  }
  if (!me || !mine) return <p className="p-6 text-muted-foreground">{error ?? t("loading")}</p>;
  const club = mine.club;
  const owner = club?.you === "OWNER";
  const linkUrl = link ? `${window.location.origin}/teams?invite=${link}` : null;

  return (
    <main className="mx-auto grid w-full max-w-3xl gap-4 p-4">
      <h1 className="font-display text-2xl">{t("title")}</h1>
      {error && <Alert variant="destructive">{error}</Alert>}

      {club ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex flex-wrap items-center gap-2">
              {club.name}
              {owner && <span className="rounded bg-primary/15 px-2 py-0.5 text-xs font-normal text-primary">{t("youOwn")}</span>}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <ul className="grid gap-1">
              {club.members.map((m) => (
                <li key={m.id} className="flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm">
                  <Link href={`/players/${m.id}`} className="min-w-0 flex-1 truncate font-medium hover:underline">{m.name}</Link>
                  {m.id === club.ownerId && <span className="flex items-center gap-1 text-xs text-muted-foreground"><Crown className="size-3.5" aria-hidden /> {t("owner")}</span>}
                  {owner && m.id !== club.ownerId && (
                    <>
                      <Button size="sm" variant="ghost" disabled={busy}
                        onClick={() => { if (window.confirm(t("transferConfirm", { name: m.name }))) void run(() => api("POST", `/api/clubs/${club.id}/owner`, { userId: m.id })); }}>
                        <Crown aria-hidden /> {t("transfer")}
                      </Button>
                      <Button size="sm" variant="ghost" disabled={busy} aria-label={t("removeNamed", { name: m.name })}
                        onClick={() => { if (window.confirm(t("removeConfirm", { name: m.name }))) void run(() => api("DELETE", `/api/clubs/${club.id}/members/${m.id}`)); }}>
                        <X aria-hidden /> {t("remove")}
                      </Button>
                    </>
                  )}
                </li>
              ))}
            </ul>

            {owner && club.requests.length > 0 && (
              <section className="grid gap-1">
                <h2 className="text-sm font-semibold">{t("requestsTitle")}</h2>
                {club.requests.map((p) => (
                  <div key={p.id} className="flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm">
                    <Link href={`/players/${p.id}`} className="min-w-0 flex-1 truncate font-medium hover:underline">{p.name}</Link>
                    <Button size="sm" disabled={busy} onClick={() => void run(() => api("POST", `/api/clubs/${club.id}/requests/${p.id}/accept`))}><Check aria-hidden /> {t("accept")}</Button>
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => void run(() => api("POST", `/api/clubs/${club.id}/requests/${p.id}/decline`))}><X aria-hidden /> {t("decline")}</Button>
                  </div>
                ))}
              </section>
            )}

            {owner && (
              <section className="grid gap-2">
                <h2 className="text-sm font-semibold">{t("inviteTitle")}</h2>
                <div className="flex flex-wrap items-end gap-2">
                  <div className="min-w-0 flex-1"><PlayerSearch id="team-invite" value={pick} onChange={setPick} disabled={busy} /></div>
                  <Button size="sm" disabled={busy || !pick}
                    onClick={() => void run(async () => { await api("POST", `/api/clubs/${club.id}/invitations`, { userId: pick!.id }); setPick(null); })}>
                    <UserPlus aria-hidden /> {t("invite")}
                  </Button>
                </div>
                {club.invitations.map((p) => (
                  <div key={p.id} className="flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm">
                    <span className="min-w-0 flex-1 truncate">{p.name} <span className="text-xs text-muted-foreground">· {t("invited")}</span></span>
                    <Button size="sm" variant="ghost" disabled={busy} onClick={() => void run(() => api("DELETE", `/api/clubs/${club.id}/invitations/${p.id}`))}><X aria-hidden /> {t("cancel")}</Button>
                  </div>
                ))}
                <div className="flex flex-wrap items-center gap-2">
                  <Button size="sm" variant="outline" disabled={busy}
                    onClick={() => void run(async () => { setLink((await api<{ invite: string }>("POST", `/api/clubs/${club.id}/link`)).invite); setCopied(false); })}>
                    {t(club.hasLink ? "newLink" : "makeLink")}
                  </Button>
                  {club.hasLink && (
                    <Button size="sm" variant="ghost" disabled={busy} onClick={() => void run(async () => { await api("DELETE", `/api/clubs/${club.id}/link`); setLink(null); })}>{t("closeLink")}</Button>
                  )}
                </div>
                {linkUrl && (
                  <div className="flex items-center gap-2">
                    <Input readOnly value={linkUrl} aria-label={t("linkLabel")} onFocus={(e) => e.currentTarget.select()} />
                    <Button size="sm" variant="outline" onClick={() => void navigator.clipboard.writeText(linkUrl).then(() => setCopied(true)).catch(() => undefined)}>
                      <Copy aria-hidden /> {t(copied ? "copied" : "copy")}
                    </Button>
                  </div>
                )}
                <p className="text-xs text-muted-foreground">{t("linkHint")}</p>
              </section>
            )}

            {owner ? (
              <section className="grid gap-2 border-t pt-3">
                {rename === null ? (
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => setRename(club.name)}>{t("rename")}</Button>
                    <Button size="sm" variant="ghost" disabled={busy}
                      onClick={() => { if (window.confirm(t("dissolveConfirm", { name: club.name }))) void run(() => api("DELETE", `/api/clubs/${club.id}`)); }}>
                      <Trash2 aria-hidden /> {t("dissolve")}
                    </Button>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-end gap-2">
                    <div className="grid min-w-0 flex-1 gap-1">
                      <Label htmlFor="team-rename">{t("name")}</Label>
                      <Input id="team-rename" maxLength={80} value={rename} onChange={(e) => setRename(e.target.value)} />
                    </div>
                    <Button size="sm" disabled={busy || rename.trim().length < 3}
                      onClick={() => void run(async () => { await api("PATCH", `/api/clubs/${club.id}`, { name: rename.trim() }); setRename(null); })}>{t("save")}</Button>
                    <Button size="sm" variant="ghost" onClick={() => setRename(null)}>{t("cancel")}</Button>
                  </div>
                )}
                <p className="text-xs text-muted-foreground">{t("ownerHint")}</p>
              </section>
            ) : (
              <div className="border-t pt-3">
                <Button size="sm" variant="outline" disabled={busy}
                  onClick={() => { if (window.confirm(t("leaveConfirm", { name: club.name }))) void run(() => api("DELETE", `/api/clubs/${club.id}/members/${me.id}`)); }}>
                  <LogOut aria-hidden /> {t("leave")}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <>
          {mine.invitations.length > 0 && (
            <Card>
              <CardHeader><CardTitle>{t("myInvitations")}</CardTitle></CardHeader>
              <CardContent className="grid gap-1">
                {mine.invitations.map((c) => (
                  <div key={c.id} className="flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm">
                    <span className="min-w-0 flex-1 truncate"><span className="font-medium">{c.name}</span> <span className="text-xs text-muted-foreground">· {t("ownerIs", { name: c.owner })}</span></span>
                    <Button size="sm" disabled={busy} onClick={() => void run(() => api("POST", `/api/clubs/${c.id}/invitations/accept`))}><Check aria-hidden /> {t("join")}</Button>
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => void run(() => api("POST", `/api/clubs/${c.id}/invitations/decline`))}><X aria-hidden /> {t("decline")}</Button>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader><CardTitle>{t("createTitle")}</CardTitle></CardHeader>
            <CardContent className="grid gap-2">
              <div className="flex flex-wrap items-end gap-2">
                <div className="grid min-w-0 flex-1 gap-1">
                  <Label htmlFor="team-name">{t("name")}</Label>
                  <Input id="team-name" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
                </div>
                <Button disabled={busy || name.trim().length < 3}
                  onClick={() => void run(async () => { await api("POST", "/api/clubs", { name: name.trim() }); setName(""); })}>{t("create")}</Button>
              </div>
              <p className="text-xs text-muted-foreground">{t("createHint")}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>{t("findTitle")}</CardTitle></CardHeader>
            <CardContent className="grid gap-2">
              <Input value={query} maxLength={80} placeholder={t("findPlaceholder")} aria-label={t("findTitle")} onChange={(e) => setQuery(e.target.value)} />
              {found.length === 0 && <p className="text-sm text-muted-foreground">{t("noTeams")}</p>}
              {found.map((c) => {
                const asked = mine.requests.some((r) => r.id === c.id);
                return (
                  <div key={c.id} className="flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm">
                    <span className="min-w-0 flex-1 truncate"><span className="font-medium">{c.name}</span> <span className="text-xs text-muted-foreground">· {t("ownerIs", { name: c.owner })} · {t("membersN", { n: c.members })}</span></span>
                    {asked ? (
                      <Button size="sm" variant="ghost" disabled={busy} onClick={() => void run(() => api("DELETE", `/api/clubs/${c.id}/requests`))}><X aria-hidden /> {t("withdraw")}</Button>
                    ) : (
                      <Button size="sm" variant="outline" disabled={busy} onClick={() => void run(() => api("POST", `/api/clubs/${c.id}/requests`))}>{t("ask")}</Button>
                    )}
                  </div>
                );
              })}
              <p className="text-xs text-muted-foreground">{t("askHint")}</p>
            </CardContent>
          </Card>
        </>
      )}
    </main>
  );
}
