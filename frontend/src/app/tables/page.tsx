import { getTranslations } from "next-intl/server";
import { TablesHome } from "@/components/table/tables-home";

export async function generateMetadata() {
  const t = await getTranslations("table");
  return { title: t("title") };
}

export default function TablesPage() {
  return <TablesHome />;
}
