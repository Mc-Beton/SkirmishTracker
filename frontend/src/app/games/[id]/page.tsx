import { getTranslations } from "next-intl/server";
import { OwnGameTracker } from "@/components/games/own-game-tracker";

export async function generateMetadata() {
  const t = await getTranslations("games");
  return { title: t("title") };
}

export default async function OwnGamePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <OwnGameTracker gameId={id} />;
}
