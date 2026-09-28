"use client";

import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useGameContent } from "@/lib/content";
import type { PlayStats, StatCount } from "@/lib/players";
import { factionName, type Armies } from "@/lib/warbands";
import { DonutChart, type Slice } from "./donut-chart";
import { TopBars } from "./top-bars";

/** Fixed colour per faction (army-list order → categorical slot), so a faction looks the same in every chart. */
function factionColor(armies: Armies | null, code: string): string {
  const i = armies ? armies.factions.findIndex((f) => f.code === code) : -1;
  return `var(--series-${i >= 0 ? (i % 8) + 1 : 8})`;
}

export function PlayStatsSection({ stats, armies }: { stats: PlayStats; armies: Armies | null }) {
  const t = useTranslations("players.stats");
  const content = useGameContent();
  const questIndex = (code: string) => content ? content.quests.findIndex((q) => q.code === code) : -1;
  const questName = (code: string) => content?.quests.find((q) => q.code === code)?.name ?? code;
  // Fixed colour per mission (scenario order → categorical slot).
  const missionSlices = (list: StatCount[]): Slice[] => [...list]
    .sort((a, b) => questIndex(a.key) - questIndex(b.key))
    .map((c) => {
      const i = questIndex(c.key);
      return { key: c.key, label: questName(c.key), count: c.count, color: `var(--series-${i >= 0 ? (i % 8) + 1 : 8})` };
    });
  const missionBars = (list: StatCount[]) => list.map((c) => ({ key: c.key, label: questName(c.key), count: c.count }));
  const unitName = (c: string) => armies?.units.find((u) => u.code === c)?.name ?? c;
  const order = (code: string) => {
    const i = armies ? armies.factions.findIndex((f) => f.code === code) : -1;
    return i < 0 ? 99 : i;
  };
  const slices = (list: StatCount[]): Slice[] => [...list]
    .sort((a, b) => order(a.key) - order(b.key))
    .map((c) => ({ key: c.key, label: factionName(armies, c.key), count: c.count, color: factionColor(armies, c.key) }));
  const bars = (list: StatCount[]) => list.map((c) => ({ key: c.key, label: unitName(c.key), count: c.count }));
  const games = (n: number) => t("games", { n });
  const wins = (n: number) => t("wins", { n });
  const losses = (n: number) => t("losses", { n });

  if (stats.games === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">{t("title")}</CardTitle>
        <p className="text-sm text-muted-foreground">
          {t("basis", { games: stats.games, withFaction: stats.gamesWithFaction, withList: stats.gamesWithList })}
          {" "}{t("basisMissions", { n: stats.gamesWithMission ?? 0 })}
        </p>
      </CardHeader>
      <CardContent className="grid gap-8 [&>*]:min-w-0">
        <div className="grid gap-6 md:grid-cols-3 [&>*]:min-w-0">
          <TopBars title={t("topUnits")} bars={bars(stats.topUnits)} empty={t("noLists")} unit={games} />
          <TopBars title={t("topWinningUnits")} bars={bars(stats.topWinningUnits)} empty={t("noLists")} unit={wins} />
          <TopBars title={t("nemesisUnits")} bars={bars(stats.nemesisUnits)} empty={t("noLists")} unit={losses} />
        </div>
        <div className="grid gap-2">
          <h3 className="font-display text-lg">{t("myFactions")}</h3>
          <div className="grid gap-6 md:grid-cols-3 [&>*]:min-w-0">
            <DonutChart title={t("played")} slices={slices(stats.factions)} empty={t("noFactions")} centerLabel={t("centerGames")} />
            <DonutChart title={t("won")} slices={slices(stats.factionWins)} empty={t("noWins")} centerLabel={t("centerWins")} />
            <DonutChart title={t("lost")} slices={slices(stats.factionLosses)} empty={t("noLosses")} centerLabel={t("centerLosses")} />
          </div>
        </div>
        <div className="grid gap-2">
          <h3 className="font-display text-lg">{t("missions")}</h3>
          <div className="grid gap-6 md:grid-cols-3 [&>*]:min-w-0">
            <DonutChart title={t("missionsPlayed")} slices={missionSlices(stats.missions ?? [])} empty={t("noMissions")} centerLabel={t("centerGames")} />
            <TopBars title={t("missionWins")} bars={missionBars(stats.missionWins ?? [])} empty={t("noWins")} unit={wins} />
            <TopBars title={t("missionLosses")} bars={missionBars(stats.missionLosses ?? [])} empty={t("noLosses")} unit={losses} />
          </div>
        </div>
        <div className="grid gap-2">
          <h3 className="font-display text-lg">{t("opponentFactions")}</h3>
          <div className="grid gap-6 md:grid-cols-3 [&>*]:min-w-0">
            <DonutChart title={t("playedAgainst")} slices={slices(stats.opponentFactions)} empty={t("noFactions")} centerLabel={t("centerGames")} />
            <DonutChart title={t("wonAgainst")} slices={slices(stats.winsAgainst)} empty={t("noWins")} centerLabel={t("centerWins")} />
            <DonutChart title={t("lostAgainst")} slices={slices(stats.lossesAgainst)} empty={t("noLosses")} centerLabel={t("centerLosses")} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
