import { getTranslations } from "next-intl/server";
import { SeasonsView } from "./seasons-view";

export async function generateMetadata() {
  const t = await getTranslations("seasons");
  return { title: t("title") };
}

export default function SeasonsPage() {
  return <SeasonsView />;
}
