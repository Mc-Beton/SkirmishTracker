import { getTranslations } from "next-intl/server";
import { LeagueList } from "./league-list";

export async function generateMetadata() {
  const t = await getTranslations("leagues");
  return { title: t("title") };
}

export default function LeaguesPage() {
  return <LeagueList />;
}
