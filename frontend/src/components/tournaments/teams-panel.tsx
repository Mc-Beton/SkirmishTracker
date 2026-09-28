"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowDown, ArrowUp, Crown, UserPlus, X } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useErrorMessage } from "@/components/auth/use-error-message";
import { api } from "@/lib/api";
import type { SearchHit } from "@/lib/players";
import type { Team, TeamsData, TournamentStatus } from "@/lib/tournaments";
import { cn } from "@/lib/utils";

const ROSTER_OPEN: TournamentStatus[] = ["DRAFT", "PUBLISHED", "REGISTRATION_CLOSED"];

/**
 * Teams of a team tournament. Players: create a team (captain), invite, accept or decline invitations, leave.
 * Captains: invite, remove, set the default board order. Organizer (manage=true): add players by nickname,
 * delete or drop teams.
 */
export function TeamsPanel({ tournamentId, meId, status, manage = false, onChanged }: {
  tournamentId: string;
  meId?: string;
  status: TournamentStatus;
  manage?: boolean;
  onChanged?: () => void;
}) {
  const t = useTranslations("tournaments.teams");
  const errorMessage = useErrorMessage();
  const [data, setData] = useState<TeamsData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const base = `/api/tournaments/${tournamentId}/teams`;

  const load = useCallback(async () => {
    setData(await api<TeamsData>("GET", base));
  }, [base]);

  useEffect(() => {
    let active = true;
    api<TeamsData>("GET", base)
      .then((d) => active && setData(d))
      .catch((err) => active && setError(errorMessage(err)));
    return () => {
      active = false;
    };
  }, [base, meId, errorMessage]);

  async function call(method: "POST" | "PUT" | "DELETE", path: string, body?: unknown) {
    setBusy(true);
    setError(null);
    try {
      await api(method, `${base}${path}`, body);
      await load();
      onChanged?.();
      return true;
    } catch (err) {
      setError(errorMessage(err));
      return false;
    } finally {
      setBusy(false);
    }
  }

  if (!data) return error ? <Alert variant="destructive">{error}</Alert> : null;
  const rosterOpen = ROSTER_OPEN.includes(status);

  return (
    <div className="grid gap-4">
      {error && <Alert variant="destructive">{error}</Alert>}

      {data.invitations.map((inv) => (
        <Alert key={inv.teamId} className="grid gap-2">
          <span>{t("invitedBy", { team: inv.teamName, captain: inv.captainName })}</span>
          <span className="flex flex-wrap gap-2">
            <Button size="sm" disabled={busy} onClick={() => call("POST", `/${inv.teamId}/accept`)}>{t("accept")}</Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => call("POST", `/${inv.teamId}/decline`)}>
              {t("decline")}
            </Button>
          </span>
        </Alert>
      ))}

      {data.canCreate && (
        <form className="flex flex-wrap items-end gap-2" onSubmit={async (e) => {
          e.preventDefault();
          if (await call("POST", "", { name: name.trim() })) setName("");
        }}>
          <label className="grid min-w-0 flex-1 gap-1 text-sm">
            <span>{t("newTeam")}</span>
            <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} required minLength={2} />
          </label>
          <Button type="submit" disabled={busy || name.trim().length < 2}>{t("create")}</Button>
          <p className="basis-full text-xs text-muted-foreground">{t("createHint", { n: data.teamSize ?? 0 })}</p>
        </form>
      )}

      {data.teams.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("none")}</p>
      ) : (
        <ul className="grid gap-3">
          {data.teams.map((team) => (
            <TeamCard key={team.id} team={team} size={data.teamSize ?? 0} meId={meId} mine={team.id === data.myTeamId}
              manage={manage} rosterOpen={rosterOpen} inProgress={status === "IN_PROGRESS"} busy={busy} call={call} />
          ))}
        </ul>
      )}
    </div>
  );
}

function TeamCard({ team, size, meId, mine, manage, rosterOpen, inProgress, busy, call }: {
  team: Team;
  size: number;
  meId?: string;
  mine: boolean;
  manage: boolean;
  rosterOpen: boolean;
  inProgress: boolean;
  busy: boolean;
  call: (method: "POST" | "PUT" | "DELETE", path: string, body?: unknown) => Promise<boolean>;
}) {
  const t = useTranslations("tournaments.teams");
  const accepted = team.members.filter((m) => m.status === "ACCEPTED");
  const members = [...team.members].sort((a, b) => a.position - b.position);
  const path = `/${team.id}`;

  function move(userId: string, delta: number) {
    const order = members.map((m) => m.userId);
    const i = order.indexOf(userId);
    const j = i + delta;
    if (j < 0 || j >= order.length) return;
    [order[i], order[j]] = [order[j], order[i]];
    void call("PUT", `${path}/order`, { order });
  }

  return (
    <li className={cn("grid gap-2 rounded-lg border p-3", mine && "border-primary/50 bg-accent/30",
      team.dropped && "opacity-60")}>
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-medium">{team.name}</h3>
        <Badge variant={team.complete ? "success" : "outline"}>{accepted.length}/{size}</Badge>
        {team.seed != null && <span className="text-xs text-muted-foreground">#{team.seed}</span>}
        {team.dropped && <Badge variant="destructive">{t("dropped")}</Badge>}
        <span className="ml-auto flex flex-wrap gap-1">
          {manage && inProgress && !team.dropped && (
            <Button size="sm" variant="ghost" disabled={busy}
              onClick={() => window.confirm(t("confirmDrop", { name: team.name })) && call("POST", `${path}/drop`)}>
              {t("drop")}
            </Button>
          )}
          {team.canManage && rosterOpen && (
            <Button size="sm" variant="ghost" disabled={busy}
              onClick={() => window.confirm(t("confirmDelete", { name: team.name })) && call("DELETE", path)}>
              {t("delete")}
            </Button>
          )}
        </span>
      </div>
      <ol className="grid gap-1 text-sm">
        {members.map((m, i) => (
          <li key={m.userId} className="flex items-center gap-2">
            <span className="w-5 text-right text-xs tabular-nums text-muted-foreground">{i + 1}.</span>
            <Link href={`/players/${m.userId}`} className={cn("min-w-0 truncate hover:underline",
              m.userId === meId && "font-semibold", m.status === "INVITED" && "text-muted-foreground")}>
              {m.displayName}
            </Link>
            {m.userId === team.captainId && <Crown className="size-3.5 text-primary" aria-label={t("captain")} />}
            {m.status === "INVITED" && <Badge variant="outline">{t("invited")}</Badge>}
            <span className="ml-auto flex items-center">
              {team.canManage && rosterOpen && (
                <>
                  <Button size="icon" variant="ghost" className="size-7" disabled={busy || i === 0}
                    aria-label={t("moveUp", { name: m.displayName })} onClick={() => move(m.userId, -1)}>
                    <ArrowUp className="size-3.5" aria-hidden />
                  </Button>
                  <Button size="icon" variant="ghost" className="size-7" disabled={busy || i === members.length - 1}
                    aria-label={t("moveDown", { name: m.displayName })} onClick={() => move(m.userId, 1)}>
                    <ArrowDown className="size-3.5" aria-hidden />
                  </Button>
                </>
              )}
              {rosterOpen && m.userId !== team.captainId && (team.canManage || m.userId === meId) && (
                <Button size="icon" variant="ghost" className="size-7" disabled={busy}
                  aria-label={m.userId === meId ? t("leave") : t("remove", { name: m.displayName })}
                  onClick={() => window.confirm(m.userId === meId ? t("confirmLeave") : t("confirmRemove", { name: m.displayName }))
                    && call("DELETE", `${path}/members/${m.userId}`)}>
                  <X className="size-3.5" aria-hidden />
                </Button>
              )}
            </span>
          </li>
        ))}
      </ol>
      {team.canManage && rosterOpen && team.members.length > 0 && (
        <p className="text-xs text-muted-foreground">{t("orderHint")}</p>
      )}
      {team.canManage && rosterOpen && accepted.length < size && (
        <InvitePicker busy={busy} onPick={(userId) => call("POST", `${path}/invite`, { userId })} />
      )}
      {manage && rosterOpen && accepted.length < size && (
        <AddByNick busy={busy} onAdd={(displayName) => call("POST", `${path}/members`, { displayName })} />
      )}
    </li>
  );
}

function InvitePicker({ busy, onPick }: { busy: boolean; onPick: (userId: string) => Promise<boolean> }) {
  const t = useTranslations("tournaments.teams");
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const q = query.trim();

  useEffect(() => {
    if (q.length < 2) return;
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
  }, [q]);

  return (
    <div className="grid gap-1">
      <label className="flex items-center gap-2 text-sm">
        <UserPlus className="size-4 text-muted-foreground" aria-hidden />
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("invitePlaceholder")}
          aria-label={t("invite")} className="h-8" />
      </label>
      {q.length >= 2 && hits.length > 0 && (
        <ul className="grid gap-1 pl-6">
          {hits.slice(0, 6).map((h) => (
            <li key={h.id}>
              <button type="button" disabled={busy}
                className="w-full rounded px-2 py-1 text-left text-sm hover:bg-accent"
                onClick={async () => { if (await onPick(h.id)) { setQuery(""); setHits([]); } }}>
                {h.displayName}{h.club && <span className="text-muted-foreground"> · {h.club}</span>}
                <span className="ml-2 text-xs text-primary">{t("invite")}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function AddByNick({ busy, onAdd }: { busy: boolean; onAdd: (nick: string) => Promise<boolean> }) {
  const t = useTranslations("tournaments.teams");
  const [nick, setNick] = useState("");
  return (
    <form className="flex items-center gap-2" onSubmit={async (e) => {
      e.preventDefault();
      if (await onAdd(nick.trim())) setNick("");
    }}>
      <Input value={nick} onChange={(e) => setNick(e.target.value)} placeholder={t("addByNick")}
        aria-label={t("addByNick")} className="h-8" maxLength={40} />
      <Button type="submit" size="sm" variant="outline" disabled={busy || nick.trim().length < 2}>{t("add")}</Button>
    </form>
  );
}
