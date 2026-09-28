import { getTranslations } from "next-intl/server";
import { TournamentList } from "./tournament-list";

export async function generateMetadata() {
  const t = await getTranslations("tournaments");
  return { title: t("title") };
}

export default function TournamentsPage() {
  return <TournamentList />;
}
