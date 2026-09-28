import { getTranslations } from "next-intl/server";
import { MyGames } from "./my-games";

export async function generateMetadata() {
  const t = await getTranslations("games");
  return { title: t("title") };
}

export default function GamesPage() {
  return <MyGames />;
}
