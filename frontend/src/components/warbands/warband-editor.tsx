"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { ArrowLeft, BookmarkPlus, Crown, Library, Lock, RefreshCw } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { useAuth } from "@/components/auth/auth-provider";
import { useErrorMessage } from "@/components/auth/use-error-message";
import { api } from "@/lib/api";
import {
  listLabel,
  sameList,
  toWarbandInput,
  unusableReason,
  type ArmyList,
  type ArmyListInput,
  type ArmyListSummary,
} from "@/lib/army-lists";
import type { TournamentDetail } from "@/lib/tournaments";
import {
  factionName,
  useArmies,
  type Armies,
  type MyWarband,
  type Warband,
  type WarbandInput,
} from "@/lib/warbands";
import { ListStatusBadge } from "./list-status-badge";
import { ListBuilder, type BuilderInitial } from "./list-builder";

type Loaded = {
  tournament: TournamentDetail;
  warband: Warband | null;
  editable: boolean;
  pointsLimit: number | null;
  sourceList: MyWarband["sourceList"];
};

/**
 * Warband builder. Without `userId` it edits the caller's own list; with `userId` it shows another player's
 * list (read-only, or editable for the organizer).
 */
export function WarbandEditor({ tournamentId, userId }: { tournamentId: string; userId?: string }) {
  const t = useTranslations("warbands");
  const errorMessage = useErrorMessage();
  const { me } = useAuth();
  const armies = useArmies();
  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const detail = api<TournamentDetail>("GET", `/api/tournaments/${tournamentId}`);
    const list = userId
      ? api<Warband>("GET", `/api/tournaments/${tournamentId}/warbands/${userId}`).then((w) => ({
          warband: w, editable: w.editable, pointsLimit: w.pointsLimit, sourceList: null,
        }))
      : api<MyWarband>("GET", `/api/tournaments/${tournamentId}/warbands/me`);
    Promise.all([detail, list])
      .then(([tournament, l]) => active && setData({
        tournament, warband: l.warband, editable: l.editable, pointsLimit: l.pointsLimit, sourceList: l.sourceList ?? null,
      }))
      .catch((err) => active && setError(errorMessage(err)));
    return () => {
      active = false;
    };
  }, [tournamentId, userId, me?.id, errorMessage]);

  const back = (
    <Link href={`/tournaments/${tournamentId}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
      <ArrowLeft className="size-4" aria-hidden /> {data?.tournament.name ?? t("backToTournament")}
    </Link>
  );

  if (!data || !armies) {
    return (
      <div className="mx-auto grid w-full max-w-5xl gap-4 px-4 py-10">
        {back}
        {error && <Alert variant="destructive">{error}</Alert>}
      </div>
    );
  }

  return (
    <div className="mx-auto grid w-full max-w-5xl gap-6 px-4 py-10 [&>*]:min-w-0">
      {back}
      <Builder data={data} armies={armies} tournamentId={tournamentId}
        userId={userId} onSaved={(w, sourceList) => setData({ ...data, warband: w, sourceList })} />
    </div>
  );
}

function Builder({ data, armies, tournamentId, userId, onSaved }: {
  data: Loaded;
  armies: Armies;
  tournamentId: string;
  userId?: string;
  onSaved: (w: Warband, sourceList: Loaded["sourceList"]) => void;
}) {
  const t = useTranslations("warbands");
  const tl = useTranslations("lists");
  const format = useFormatter();
  const errorMessage = useErrorMessage();
  const initial = data.warband;
  const editable = data.editable;
  const limit = data.pointsLimit;
  // Roster format: the roster has no leader – a party and its leader are picked for every game.
  const roster = data.tournament.listFormat === "ROSTER";
  const partyLimit = data.tournament.partyLimit;
  const own = !userId;

  // "My lists": load one into the editor (a copy), compare with the list it came from, save the draft there.
  const [mine, setMine] = useState<ArmyListSummary[] | null>(null);
  const [start, setStart] = useState<BuilderInitial>(initial);
  const [builderKey, setBuilderKey] = useState(0);
  const [picked, setPicked] = useState<ArmyList | null>(null);
  const [source, setSource] = useState<ArmyList | null>(null);
  const [draft, setDraft] = useState<WarbandInput | null>(null);
  const [libError, setLibError] = useState<string | null>(null);
  const [libNote, setLibNote] = useState<string | null>(null);
  const sourceId = data.sourceList?.id ?? null;

  useEffect(() => {
    if (!own || !editable) return;
    let active = true;
    api<ArmyListSummary[]>("GET", "/api/army-lists").then((l) => active && setMine(l)).catch(() => active && setMine([]));
    return () => {
      active = false;
    };
  }, [own, editable]);

  useEffect(() => {
    if (!own || !sourceId) return;
    let active = true;
    api<ArmyList>("GET", `/api/army-lists/${sourceId}`).then((l) => active && setSource(l)).catch(() => undefined);
    return () => {
      active = false;
    };
  }, [own, sourceId]);

  const onChange = useCallback((b: WarbandInput) => setDraft(b), []);

  async function load(id: string) {
    setLibError(null);
    setLibNote(null);
    try {
      const l = await api<ArmyList>("GET", `/api/army-lists/${id}`);
      setPicked(l);
      setStart(toWarbandInput(l));
      setBuilderKey((k) => k + 1);
      setLibNote(tl("loaded", { list: listLabel(l) }));
    } catch (err) {
      setLibError(errorMessage(err));
    }
  }

  async function saveToMyLists(update: ArmyList | null) {
    if (!draft) return;
    setLibError(null);
    setLibNote(null);
    const body: ArmyListInput = {
      name: update ? update.name : data.tournament.name.slice(0, 80),
      format: update ? update.format : data.tournament.listFormat,
      list: draft,
    };
    try {
      const l = update
        ? await api<ArmyList>("PUT", `/api/army-lists/${update.id}`, body)
        : await api<ArmyList>("POST", "/api/army-lists", body);
      if (update) setSource(l);
      setMine((m) => m && [...m.filter((x) => x.id !== l.id), { ...l, units: l.units.length }].sort((a, b) => a.number - b.number));
      setLibNote(update ? tl("updated", { list: listLabel(l) }) : tl("savedAs", { list: listLabel(l) }));
    } catch (err) {
      setLibError(errorMessage(err));
    }
  }

  async function save(body: WarbandInput) {
    const path = userId ? `warbands/${userId}` : "warbands/me";
    const w = await api<Warband>("PUT", `/api/tournaments/${tournamentId}/${path}`,
      { ...body, sourceListId: own && picked ? picked.id : null });
    const src = own && picked ? { id: picked.id, number: picked.number, name: picked.name } : data.sourceList;
    if (own && picked) setSource(picked);
    setPicked(null);
    onSaved(w, src);
  }

  const deadline = data.tournament.listDeadline;
  const owner = userId ? initial?.displayName ?? "" : null;

  const header = (
    <header className="grid gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="font-display text-3xl">{owner ? t("titleOf", { name: owner }) : t("title")}</h1>
        {initial && <ListStatusBadge status={initial.listStatus} />}
      </div>
      {deadline && (
        <p className="text-sm text-muted-foreground">
          {t("deadline", { date: format.dateTime(new Date(deadline), { dateStyle: "medium", timeStyle: "short" }) })}
        </p>
      )}
      {!editable && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Lock className="size-4" aria-hidden /> {userId ? t("readOnly") : t("locked")}
        </p>
      )}
    </header>
  );

  if (!editable) {
    if (!initial) {
      return (
        <>
          {header}
          <p className="text-muted-foreground">{t("none")}</p>
        </>
      );
    }
    return (
      <>
        {header}
        <Card>
          <CardContent className="grid gap-4">
            <p>
              <span className="font-medium">{factionName(armies, initial.faction)}</span>
              {initial.alliedFaction && <span className="text-muted-foreground"> + {factionName(armies, initial.alliedFaction)}</span>}
              {!roster && <span className="text-muted-foreground"> · {t("leaderInt")} {initial.leaderInt}</span>}
            </p>
            <ul className="grid gap-2">
              {initial.units.map((u, i) => (
                <li key={i} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b pb-2 last:border-0">
                  <span className="flex items-center gap-1 font-medium">
                    {u.leader && <Crown className="size-4 text-amber-600" aria-label={t("leader")} />}
                    {u.name}
                  </span>
                  {u.source && u.source !== initial.faction && <Badge variant="outline">{factionName(armies, u.source)}</Badge>}
                  {u.notes && <span className="text-sm text-muted-foreground">{u.notes}</span>}
                  <span className="ml-auto tabular-nums">{u.totalPoints ?? u.points}</span>
                  {(u.items?.length > 0 || u.extraPoints > 0) && (
                    <ul className="grid w-full gap-0.5 border-l-2 border-primary/30 pl-3 text-sm text-muted-foreground">
                      <li className="flex justify-between"><span>{u.name}</span><span className="tabular-nums">{u.points}</span></li>
                      {u.items.map((it, k) => (
                        <li key={k} className="flex justify-between"><span>{it.name}</span><span className="tabular-nums">+{it.points}</span></li>
                      ))}
                      {u.extraPoints > 0 && (
                        <li className="flex justify-between"><span>{t("otherPoints")}</span><span className="tabular-nums">+{u.extraPoints}</span></li>
                      )}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
            <div className="flex justify-between border-t pt-2 font-medium">
              <span>{t("total")}</span>
              <span className="tabular-nums">{initial.totalPoints}{initial.pointsLimit != null && ` / ${initial.pointsLimit}`}</span>
            </div>
          </CardContent>
        </Card>
      </>
    );
  }


  const differs = !!(source && draft && !sameList(draft, toWarbandInput(source), roster));
  const library = own && (
    <Card>
      <CardContent className="grid gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="grid min-w-0 flex-1 gap-1.5">
            <Label htmlFor="wb-library" className="flex items-center gap-1.5"><Library className="size-4" aria-hidden /> {tl("pick")}</Label>
            <NativeSelect id="wb-library" value="" disabled={!mine || mine.length === 0}
              onChange={(e) => e.target.value && void load(e.target.value)}>
              <option value="">{mine && mine.length === 0 ? tl("pickNone") : tl("pickPlaceholder")}</option>
              {(mine ?? []).map((l) => {
                const why = unusableReason(l, data.tournament.listFormat, limit);
                return (
                  <option key={l.id} value={l.id} disabled={!!why}>
                    {listLabel(l)} · {factionName(armies, l.faction)} · {l.totalPoints} {t("pts")}
                    {why ? ` – ${why.key === "format" ? tl(`why.format${l.format}`) : tl("why.points", { points: why.points, limit: why.limit })}` : ""}
                  </option>
                );
              })}
            </NativeSelect>
          </div>
          <Button type="button" variant="outline" size="sm" asChild>
            <Link href="/lists">{tl("manage")}</Link>
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">{tl("copyHint")}</p>
        {libError && <Alert variant="destructive">{libError}</Alert>}
        {libNote && <Alert>{libNote}</Alert>}
        {picked && <p className="text-sm text-amber-600">{tl("notSavedYet", { list: listLabel(picked) })}</p>}
        {!picked && data.sourceList && (
          <p className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted-foreground">{tl("copiedFrom", { list: listLabel(data.sourceList) })}</span>
            {differs && <Badge variant="warning">{tl("differs")}</Badge>}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          {!picked && differs && source && (
            <Button type="button" size="sm" variant="outline" onClick={() => void saveToMyLists(source)}>
              <RefreshCw aria-hidden /> {tl("updateSource", { list: listLabel(source) })}
            </Button>
          )}
          {draft && draft.units.length > 0 && (!data.sourceList || differs) && (
            <Button type="button" size="sm" variant="ghost" onClick={() => void saveToMyLists(null)}>
              <BookmarkPlus aria-hidden /> {tl("saveAsNew")}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );

  return (
    <>
      {header}
      {library}
      <ListBuilder key={builderKey} armies={armies} initial={start} roster={roster} limit={limit}
        rosterNote={t("rosterHint", { party: partyLimit ?? "–" })} onSave={save} onChange={onChange}
        saveHint={own ? t("saveHint") : undefined} />
    </>
  );
}
