import { getTranslations } from "next-intl/server";
import { NewLeague } from "./new-league";

export async function generateMetadata() {
  const t = await getTranslations("leagues");
  return { title: t("create") };
}

export default function NewLeaguePage() {
  return <NewLeague />;
}
