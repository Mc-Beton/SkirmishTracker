import { getTranslations } from "next-intl/server";
import { ScenarioBrowser } from "./scenario-browser";

export async function generateMetadata() {
  const t = await getTranslations("scenarios");
  return { title: t("title") };
}

export default function ScenariosPage() {
  return <ScenarioBrowser />;
}
