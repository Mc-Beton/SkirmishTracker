"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { Check, Trash2, X } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { useAuth } from "@/components/auth/auth-provider";
import { useErrorMessage } from "@/components/auth/use-error-message";
import { api } from "@/lib/api";
import { useGameContent } from "@/lib/content";
import type { FriendlyGame, GameReport } from "@/lib/games";
import type { PlayerProfile, SearchHit } from "@/lib/players";
import { factionName, useArmies, type Armies } from "@/lib/warbands";
import { GameListPicker, type ListDraft } from "@/components/games/game-list-picker";

const today = () => new Date().toISOString().slice(0, 10);

export function MyGames() {
  const t = useTranslations("games");
  const errorMessage = useErrorMessage();
  const router = useRouter();
  const { me, loading } = useAuth();
  const [games, setGames] = useState<FriendlyGame[] | null>(null);
  const [leagues, setLeagues] = useState<PlayerProfile["leagues"]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !me) router.replace("/login");
  }, [loading, me, router]);

  const load = useCallback(async () => setGames(await api<FriendlyGame[]>("GET", "/api/games/mine")), []);

  useEffect(() => {
    if (!me) return;
    let active = true;
    Promise.all([
      api<FriendlyGame[]>("GET", "/api/games/mine"),
      api<PlayerProfile>("GET", `/api/players/${me.id}`),
    ])
      .then(([g, p]) => {
        if (!active) return;
        setGames(g);
        setLeagues(p.leagues.filter((l) => l.active && l.scoringMode !== "PLACE_POINTS"));
      })
      .catch((err) => active && setError(errorMessage(err)));
    return () => {
      active = false;
    };
  }, [me, errorMessage]);

  async function run(fn: () => Promise<unknown>) {
    setError(null);
    try {
      await fn();
      await load();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  if (!me || !games) {
    return <div className="mx-auto w-full max-w-5xl px-4 py-10">{error && <Alert variant="destructive">{error}</Alert>}</div>;
  }
  const toConfirm = games.filter((g) => g.canConfirm);
  const waiting = games.filter((g) => g.canWithdraw);
  const history = games.filter((g) => g.status !== "PENDING");

  return (
    <div className="mx-auto grid w-full max-w-5xl gap-6 px-4 py-10 [&>*]:min-w-0">
      <div className="grid gap-1">
        <h1 className="font-display text-3xl">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("lead")}</p>
      </div>
      {error && <Alert variant="destructive">{error}</Alert>}

      {toConfirm.length > 0 && (
        <Card className="border-primary/40">
          <CardHeader><CardTitle className="text-xl">{t("toConfirm")}</CardTitle></CardHeader>
          <CardContent className="grid gap-2">
            {toConfirm.map((g) => (
              <GameLine key={g.id} game={g} meId={me.id} actions={
                <>
                  <Button size="sm" onClick={() => run(() => api("POST", `/api/games/${g.id}/confirm`))}><Check aria-hidden /> {t("confirm")}</Button>
                  <Button size="sm" variant="outline" onClick={() => run(() => api("POST", `/api/games/${g.id}/reject`))}><X aria-hidden /> {t("reject")}</Button>
                </>
              } />
            ))}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_1fr] [&>*]:min-w-0">
        <Card>
          <CardHeader><CardTitle className="text-xl">{t("report")}</CardTitle></CardHeader>
          <CardContent>
            <ReportForm leagues={leagues} onSaved={load} />
          </CardContent>
        </Card>
        <div className="grid content-start gap-6">
          <Card>
            <CardHeader><CardTitle className="text-xl">{t("waiting")}</CardTitle></CardHeader>
            <CardContent className="grid gap-2">
              {waiting.length === 0 ? <p className="text-sm text-muted-foreground">{t("none")}</p> : waiting.map((g) => (
                <GameLine key={g.id} game={g} meId={me.id} actions={
                  <Button size="sm" variant="ghost" onClick={() => window.confirm(t("confirmWithdraw")) && run(() => api("DELETE", `/api/games/${g.id}`))}>
                    <Trash2 aria-hidden /> <span className="sr-only">{t("withdraw")}</span>
                  </Button>
                } />
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-xl">{t("history")}</CardTitle></CardHeader>
            <CardContent className="grid gap-2">
              {history.length === 0 ? <p className="text-sm text-muted-foreground">{t("none")}</p> : history.map((g) => (
                <GameLine key={g.id} game={g} meId={me.id} />
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function GameLine({ game: g, meId, actions }: { game: FriendlyGame; meId: string; actions?: React.ReactNode }) {
  const t = useTranslations("games");
  const format = useFormatter();
  const armies = useArmies();
  const mineA = g.playerA.id === meId;
  const opp = mineA ? g.playerB : g.playerA;
  const my = mineA ? g.smallA : g.smallB;
  const their = mineA ? g.smallB : g.smallA;
  const myFaction = mineA ? g.factionA : g.factionB;
  const oppFaction = mineA ? g.factionB : g.factionA;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border p-3 text-sm">
      <span className="tabular-nums text-muted-foreground">{format.dateTime(new Date(`${g.playedOn}T00:00:00`), { dateStyle: "medium" })}</span>
      <span>
        {t("vs")} <Link href={`/players/${opp.id}`} className="font-medium hover:underline">{opp.displayName}</Link>
      </span>
      <span className="font-semibold tabular-nums">{my}:{their}</span>
      {(myFaction || oppFaction) && (
        <span className="text-xs text-muted-foreground">
          {factionName(armies, myFaction) || "?"} vs {factionName(armies, oppFaction) || "?"}
        </span>
      )}
      {g.league && <Badge variant="outline">{g.league.name}</Badge>}
      {g.status === "REJECTED" && <Badge variant="destructive">{t("rejected")}</Badge>}
      {g.status === "CONFIRMED" && <Badge variant="success">{t("confirmed")}</Badge>}
      {actions && <span className="ml-auto flex gap-2">{actions}</span>}
      {(g.listA || g.listB) && (
        <details className="w-full text-xs">
          <summary className="cursor-pointer text-muted-foreground">{t("list.show")}</summary>
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            <ListPreview list={mineA ? g.listA : g.listB} armies={armies} title={t("list.mineShort")} />
            <ListPreview list={mineA ? g.listB : g.listA} armies={armies} title={opp.displayName} />
          </div>
        </details>
      )}
    </div>
  );
}

function ListToggle({ id, label, title, armies, value, onChange, fallback }: {
  id: string; label: string; title: string; armies: Armies; value: ListDraft | null; onChange: (v: ListDraft | null) => void; fallback: string;
}) {
  const t = useTranslations("games.list");
  if (!value) {
    const first = fallback || armies.factions.find((f) => f.playable)?.code || "";
    return (
      <Button type="button" variant="outline" size="sm" className="justify-self-start"
        onClick={() => onChange({ faction: first, alliedFaction: null, units: [] })}>
        + {t("add", { who: label })}
      </Button>
    );
  }
  return (
    <div className="grid gap-1">
      <GameListPicker id={id} label={title} armies={armies} value={value} onChange={onChange} />
      <Button type="button" variant="ghost" size="sm" className="justify-self-start text-xs" onClick={() => onChange(null)}>
        {t("remove")}
      </Button>
    </div>
  );
}

function ListPreview({ list, armies, title }: { list: FriendlyGame["listA"]; armies: Armies | null; title: string }) {
  const t = useTranslations("games.list");
  if (!list) return null;
  const unitName = (c: string) => armies?.units.find((u) => u.code === c)?.name ?? c;
  const itemName = (c: string) => armies?.items.find((i) => i.code === c)?.name ?? c;
  return (
    <div className="grid gap-1">
      <p className="font-medium">
        {title}: {factionName(armies, list.faction)}{list.alliedFaction && ` + ${factionName(armies, list.alliedFaction)}`}
        <span className="font-normal text-muted-foreground"> · {t("total", { points: list.totalPoints })}</span>
      </p>
      <ul className="grid gap-0.5 text-muted-foreground">
        {list.units.map((u, i) => (
          <li key={i}>
            {u.leader && "♛ "}{unitName(u.unit)}
            {u.items.length > 0 && <span className="text-xs"> ({u.items.map((x) => itemName(x.item)).join(", ")})</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

function ReportForm({ leagues, onSaved }: { leagues: PlayerProfile["leagues"]; onSaved: () => Promise<void> }) {
  const t = useTranslations("games");
  const errorMessage = useErrorMessage();
  const content = useGameContent();
  const armies = useArmies();
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [opponent, setOpponent] = useState<SearchHit | null>(null);
  const [myScore, setMyScore] = useState("");
  const [oppScore, setOppScore] = useState("");
  const [playedOn, setPlayedOn] = useState(today());
  const [scenario, setScenario] = useState("");
  const [myFaction, setMyFaction] = useState("");
  const [oppFaction, setOppFaction] = useState("");
  const [league, setLeague] = useState("");
  const [notes, setNotes] = useState("");
  const [myList, setMyList] = useState<ListDraft | null>(null);
  const [oppList, setOppList] = useState<ListDraft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2 || opponent) return;
    let active = true;
    const timer = setTimeout(() => {
      api<SearchHit[]>("GET", `/api/players/search?${new URLSearchParams({ q })}`)
        .then((h) => active && setHits(h))
        .catch(() => active && setHits([]));
    }, 250);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [query, opponent]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!opponent) {
      setError(t("pickOpponent"));
      return;
    }
    setError(null);
    setBusy(true);
    const body: GameReport = {
      opponentId: opponent.id,
      myScore: Number(myScore),
      opponentScore: Number(oppScore),
      playedOn,
      scenarioCode: scenario || null,
      myFaction: myList ? myList.faction : myFaction || null,
      opponentFaction: oppList ? oppList.faction : oppFaction || null,
      leagueId: league || null,
      notes: notes.trim() || null,
      myList: myList && myList.units.length > 0 ? myList : null,
      opponentList: oppList && oppList.units.length > 0 ? oppList : null,
    };
    try {
      await api("POST", "/api/games", body);
      setSaved(true);
      setOpponent(null);
      setQuery("");
      setMyScore("");
      setOppScore("");
      setNotes("");
      setMyList(null);
      setOppList(null);
      await onSaved();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const playable = armies?.factions.filter((f) => f.playable) ?? [];

  return (
    <form method="post" onSubmit={submit} className="grid gap-4">
      {error && <Alert variant="destructive">{error}</Alert>}
      {saved && <Alert variant="success">{t("saved")}</Alert>}
      <div className="relative grid gap-2">
        <Label htmlFor="opponent">{t("opponent")}</Label>
        {opponent ? (
          <div className="flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm">
            <span className="font-medium">{opponent.displayName}</span>
            {opponent.club && <span className="text-muted-foreground">· {opponent.club}</span>}
            <button type="button" className="ml-auto text-muted-foreground hover:text-foreground" aria-label={t("changeOpponent")}
              onClick={() => { setOpponent(null); setHits([]); }}>
              <X className="size-4" aria-hidden />
            </button>
          </div>
        ) : (
          <>
            <Input id="opponent" autoComplete="off" placeholder={t("searchPlaceholder")} value={query}
              onChange={(e) => { setSaved(false); setQuery(e.target.value); if (e.target.value.trim().length < 2) setHits([]); }} />
            {hits.length > 0 && (
              <ul className="absolute top-full z-10 mt-1 grid w-full rounded-md border bg-card shadow-md">
                {hits.map((h) => (
                  <li key={h.id}>
                    <button type="button" className="w-full px-3 py-2 text-left text-sm hover:bg-accent"
                      onClick={() => { setOpponent(h); setHits([]); }}>
                      {h.displayName}{h.club && <span className="text-muted-foreground"> · {h.club}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
      <div className="grid grid-cols-3 items-end gap-3">
        <div className="grid gap-2">
          <Label htmlFor="myScore">{t("myScore")}</Label>
          <Input id="myScore" type="number" min={0} max={1000} required value={myScore} onChange={(e) => setMyScore(e.target.value)} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="oppScore">{t("opponentScore")}</Label>
          <Input id="oppScore" type="number" min={0} max={1000} required value={oppScore} onChange={(e) => setOppScore(e.target.value)} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="playedOn">{t("playedOn")}</Label>
          <Input id="playedOn" type="date" required max={today()} value={playedOn} onChange={(e) => setPlayedOn(e.target.value)} />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {!myList && (
          <div className="grid gap-2">
            <Label htmlFor="myFaction">{t("myFaction")}</Label>
            <NativeSelect id="myFaction" value={myFaction} onChange={(e) => setMyFaction(e.target.value)}>
              <option value="">–</option>
              {playable.map((f) => <option key={f.code} value={f.code}>{factionName(armies, f.code)}</option>)}
            </NativeSelect>
          </div>
        )}
        {!oppList && (
          <div className="grid gap-2">
            <Label htmlFor="oppFaction">{t("opponentFaction")}</Label>
            <NativeSelect id="oppFaction" value={oppFaction} onChange={(e) => setOppFaction(e.target.value)}>
              <option value="">–</option>
              {playable.map((f) => <option key={f.code} value={f.code}>{factionName(armies, f.code)}</option>)}
            </NativeSelect>
          </div>
        )}
      </div>
      {armies && (
        <div className="grid gap-3">
          <ListToggle label={t("list.mine")} title={t("list.mineTitle")} armies={armies} value={myList} onChange={setMyList} fallback={myFaction} id="my-list" />
          <ListToggle label={t("list.opponent")} title={t("list.opponentTitle")} armies={armies} value={oppList} onChange={setOppList} fallback={oppFaction} id="opp-list" />
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="scenario">{t("scenario")}</Label>
          <NativeSelect id="scenario" value={scenario} onChange={(e) => setScenario(e.target.value)}>
            <option value="">–</option>
            {content?.quests.map((q) => <option key={q.code} value={q.code}>{q.name}</option>)}
          </NativeSelect>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="league">{t("league")}</Label>
          <NativeSelect id="league" value={league} onChange={(e) => setLeague(e.target.value)}>
            <option value="">{t("noLeague")}</option>
            {leagues.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </NativeSelect>
        </div>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="notes">{t("notes")}</Label>
        <Input id="notes" maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
      <p className="text-xs text-muted-foreground">{t("hint")}</p>
      <Button type="submit" disabled={busy} className="justify-self-start">{t("submit")}</Button>
    </form>
  );
}
