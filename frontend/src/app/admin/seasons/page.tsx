import { getTranslations } from "next-intl/server";
import { ManageSeasons } from "./manage-seasons";

export async function generateMetadata() {
  const t = await getTranslations("seasons.admin");
  return { title: t("title") };
}

export default function ManageSeasonsPage() {
  return <ManageSeasons />;
}
