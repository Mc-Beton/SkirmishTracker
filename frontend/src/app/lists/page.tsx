import { getTranslations } from "next-intl/server";
import { MyLists } from "@/components/army-lists/my-lists";

export async function generateMetadata() {
  const t = await getTranslations("lists");
  return { title: t("title") };
}

export default function ListsPage() {
  return <MyLists />;
}
