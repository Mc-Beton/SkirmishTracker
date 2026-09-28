import { getTranslations } from "next-intl/server";
import { NewTournament } from "./new-tournament";

export async function generateMetadata() {
  const t = await getTranslations("tournaments.form");
  return { title: t("createTitle") };
}

export default function NewTournamentPage() {
  return <NewTournament />;
}
