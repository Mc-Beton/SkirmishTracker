import { getTranslations } from "next-intl/server";
import { Ranking } from "./ranking";

export async function generateMetadata() {
  const t = await getTranslations("players");
  return { title: t("rankingTitle") };
}

export default function PlayersPage() {
  return <Ranking />;
}
