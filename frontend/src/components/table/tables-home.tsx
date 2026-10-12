"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Map as MapIcon, Swords } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NativeSelect } from "@/components/ui/native-select";
import { useAuth } from "@/components/auth/auth-provider";
import { useErrorMessage } from "@/components/auth/use-error-message";
import { MapPicker } from "@/components/table/map-picker";
import { InviteLink } from "@/components/table/invite-links";
import { api } from "@/lib/api";
import { listLabel, type ArmyListSummary } from "@/lib/army-lists";
import {
  MEASURE_MODES, inviteLink, type CreatedTable, type InviteKind, type MapSummary, type MeasureMode, type TableSummary,
} from "@/lib/table/api";
import { useGameContent } from "@/lib/content";

/** "Online play": my tables, a new table (map + list → invitation link). */
export function TablesHome() {
  const t = useTranslations("table");
  const errorMessage = useErrorMessage();
  const router = useRouter();
  const { me, loading } = useAuth();
  const [tables, setTables] = useState<TableSummary[] | null>(null);
  const [lists, setLists] = useState<ArmyListSummary[]>([]);
  const [map, setMap] = useState<MapSummary | null>(null);
  const [listId, setListId] = useState("");
  const [questCode, setQuestCode] = useState("");
  const content = useGameContent();
  const [measureMode, setMeasureMode] = useState<MeasureMode>("ASSISTED");
  const [withJudge, setWithJudge] = useState(false);
  const [withObservers, setWithObservers] = useState(false);
  const [invite, setInvite] = useState<{ id: string; links: { kind: InviteKind; link: string }[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && !me) router.replace("/login");
  }, [loading, me, router]);

  useEffect(() => {
    if (!me) return;
    api<TableSummary[]>("GET", "/api/tables/mine").then(setTables).catch((e) => setError(errorMessage(e)));
    api<ArmyListSummary[]>("GET", "/api/army-lists").then(setLists).catch(() => setLists([]));
  }, [me, errorMessage]);

  const create = async () => {
    if (!map || !listId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api<CreatedTable>("POST", "/api/tables", {
        mapId: map.id, listId, questCode: questCode || null, measureMode, judge: withJudge, observers: withObservers,
      });
      const links: { kind: InviteKind; link: string }[] = [{ kind: "PLAYER", link: inviteLink("PLAYER", res.invite) }];
      if (res.judgeInvite) links.push({ kind: "JUDGE", link: inviteLink("JUDGE", res.judgeInvite) });
      if (res.watchInvite) links.push({ kind: "WATCH", link: inviteLink("WATCH", res.watchInvite) });
      setInvite({ id: res.id, links });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto grid max-w-5xl gap-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="font-display text-2xl">{t("title")}</h1>
        <Button asChild variant="outline"><Link href="/maps"><MapIcon aria-hidden /> {t("mapsLink")}</Link></Button>
      </div>
      <p className="text-sm text-muted-foreground">{t("intro")}</p>
      {error && <Alert variant="destructive">{error}</Alert>}

      <Card>
        <CardHeader><CardTitle>{t("myTables")}</CardTitle></CardHeader>
        <CardContent>
          {tables === null ? <p className="text-sm text-muted-foreground">{t("loading")}</p> : tables.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noTables")}</p>
          ) : (
            <ul className="grid gap-2">
              {tables.map((x) => (
                <li key={x.id}>
                  <Link href={`/tables/${x.id}`} className="flex flex-wrap items-center gap-2 rounded-md border p-2 hover:bg-accent">
                    <Swords className="size-4" aria-hidden />
                    <span className="font-medium">{x.mapName}</span>
                    <span className="text-sm text-muted-foreground">{x.playerA.name} – {x.playerB?.name ?? t("waitingShort")}</span>
                    {x.role !== "PLAYER" && <Badge variant="secondary" className="ml-auto">{t(`role.${x.role}`)}</Badge>}
                    <Badge variant="outline" className={x.role !== "PLAYER" ? "" : "ml-auto"}>{t(`status.${x.status}`)}</Badge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>{t("newTable")}</CardTitle></CardHeader>
        <CardContent className="grid gap-4">
          {invite ? (
            <div className="grid gap-2">
              <Alert variant="success">{t("inviteReady")}</Alert>
              {invite.links.map((l) => <InviteLink key={l.kind} kind={l.kind} link={l.link} />)}
              <p className="text-xs text-muted-foreground">{t("linksOnce")}</p>
              <Button asChild><Link href={`/tables/${invite.id}`}>{t("openTable")}</Link></Button>
            </div>
          ) : (
            <>
              <section className="grid gap-2">
                <h2 className="text-sm font-medium">{t("step1Map")}</h2>
                <MapPicker selected={map?.id} onSelect={setMap} />
              </section>
              <section className="grid gap-2">
                <h2 className="text-sm font-medium">{t("step2List")}</h2>
                {lists.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t.rich("noLists", { link: (c) => <Link className="underline" href="/lists">{c}</Link> })}</p>
                ) : (
                  <NativeSelect value={listId} onChange={(e) => setListId(e.target.value)} aria-label={t("step2List")}>
                    <option value="">{t("chooseList")}</option>
                    {lists.map((l) => <option key={l.id} value={l.id}>{listLabel(l)} · {l.totalPoints} pkt</option>)}
                  </NativeSelect>
                )}
              </section>
              <section className="grid gap-2">
                <h2 className="text-sm font-medium">{t("step3Quest")}</h2>
                <NativeSelect value={questCode} onChange={(e) => setQuestCode(e.target.value)} aria-label={t("step3Quest")}>
                  <option value="">{t("noQuest")}</option>
                  {(content?.quests ?? []).map((q) => <option key={q.code} value={q.code}>{q.name}</option>)}
                </NativeSelect>
              </section>
              <section className="grid gap-2">
                <h2 className="text-sm font-medium">{t("step4Options")}</h2>
                <label className="grid gap-1 text-sm">{t("measureMode")}
                  <NativeSelect value={measureMode} onChange={(e) => setMeasureMode(e.target.value as MeasureMode)}>
                    {MEASURE_MODES.map((m) => <option key={m} value={m}>{t(`measure.${m}`)}</option>)}
                  </NativeSelect>
                  <span className="text-xs text-muted-foreground">{t(`measureHelp.${measureMode}`)}</span>
                </label>
                <label className="flex items-start gap-2 text-sm">
                  <input type="checkbox" className="mt-1 size-4 accent-[var(--primary)]" checked={withJudge} onChange={(e) => setWithJudge(e.target.checked)} />
                  <span>{t("withJudge")}<span className="block text-xs text-muted-foreground">{t("judgeHelp")}</span></span>
                </label>
                <label className="flex items-start gap-2 text-sm">
                  <input type="checkbox" className="mt-1 size-4 accent-[var(--primary)]" checked={withObservers} onChange={(e) => setWithObservers(e.target.checked)} />
                  <span>{t("observersAllowed")}<span className="block text-xs text-muted-foreground">{t("observersHelp")}</span></span>
                </label>
              </section>
              <Button disabled={busy || !map || !listId} onClick={() => void create()}>{t("createTable")}</Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
